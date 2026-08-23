import {
  type AccountId,
  accountIdFromString,
  type CardCycle,
  type CardPurchase,
  type CardPurchaseId,
  cardPurchaseIdFromString,
  ledgerDateFromString,
  settleCardCycle as settleCardCycleInLedger,
  settleCardPurchase as settleCardPurchaseInLedger,
  type SubEnvelope,
  type SubEnvelopeId,
  subEnvelopeIdFromString,
  transactionIdFromString,
} from "@gastos/shared";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { publicProcedure, router } from "../trpc";
import { addTransaction, getAccounts, getCardPurchases, getCreditCards, getSubEnvelopes } from "../store";

/**
 * Throws a `NOT_FOUND` TRPCError unless some item in `items` has the given
 * `id`. Small per-file copy of the same "look it up, 404 if missing" helper
 * `reference.ts`/`budget.ts` define — this codebase's established convention
 * is per-file duplication of this kind of helper rather than sharing it
 * across routers.
 */
function assertIdExists(
  items: readonly { readonly id: unknown }[],
  id: unknown,
  notFoundMessage: string,
): void {
  const exists = items.some((item) => item.id === id);
  if (!exists) {
    throw new TRPCError({ code: "NOT_FOUND", message: notFoundMessage });
  }
}

/**
 * Looks up the `CardPurchase` for `purchaseId`, throwing `NOT_FOUND` if
 * missing. Factored out of the `settleCardPurchase` mutation to keep it
 * under the complexity/length caps.
 */
function findCardPurchase(purchaseId: string): CardPurchase {
  const purchase = getCardPurchases().find((candidate) => candidate.id === purchaseId);
  if (purchase === undefined) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Card purchase "${purchaseId}" not found` });
  }
  return purchase;
}

/**
 * Looks up the `SubEnvelope` an envelope-funded `CardPurchase` declares as
 * its `FundingSource`, throwing `NOT_FOUND` if it's somehow missing (a cheap
 * defensive check — this app's referential-integrity invariants should
 * always guarantee it exists). Returns `undefined` for `"account"`/`"none"`
 * funding, where no `fundingSubEnvelope` is needed.
 */
function resolveFundingSubEnvelope(purchase: CardPurchase): SubEnvelope | undefined {
  if (purchase.fundingSource.kind !== "envelope") {
    return undefined;
  }

  const subEnvelopeId = purchase.fundingSource.subEnvelopeId;
  const fundingSubEnvelope = getSubEnvelopes().find((candidate) => candidate.id === subEnvelopeId);
  if (fundingSubEnvelope === undefined) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Sub-envelope "${subEnvelopeId}" not found`,
    });
  }
  return fundingSubEnvelope;
}

/**
 * Validates every `settlements[]` entry's `purchaseId`/`accountId`/
 * `subEnvelopeId` against the seeded stores (`NOT_FOUND` for any miss), and
 * builds a `purchaseId -> {accountId, subEnvelopeId}` lookup for
 * `buildSettleCycleResolver` to consult. Mirrors
 * `budget.ts`'s `parseAndValidateApplications`.
 */
function parseAndValidateSettlements(
  settlements: readonly { purchaseId: string; accountId: string; subEnvelopeId: string }[],
): Map<CardPurchaseId, { accountId: AccountId; subEnvelopeId: SubEnvelopeId }> {
  const settlementsByPurchaseId = new Map<
    CardPurchaseId,
    { accountId: AccountId; subEnvelopeId: SubEnvelopeId }
  >();

  for (const settlement of settlements) {
    const purchaseId = cardPurchaseIdFromString(settlement.purchaseId);
    assertIdExists(getCardPurchases(), purchaseId, `Card purchase "${purchaseId}" not found`);

    const accountId = accountIdFromString(settlement.accountId);
    assertIdExists(getAccounts(), accountId, `Account "${accountId}" not found`);

    const subEnvelopeId = subEnvelopeIdFromString(settlement.subEnvelopeId);
    assertIdExists(getSubEnvelopes(), subEnvelopeId, `Sub-envelope "${subEnvelopeId}" not found`);

    settlementsByPurchaseId.set(purchaseId, { accountId, subEnvelopeId });
  }

  return settlementsByPurchaseId;
}

/**
 * Builds the resolver `settleCardCycle` (the domain function) calls once per
 * in-cycle purchase: purchases absent from `settlements` are skipped
 * (resolver returns `null`); purchases present resolve to a concrete
 * `SettleCardPurchaseInput` using the caller-supplied account/sub-envelope,
 * plus the purchase's own funding sub-envelope when it's envelope-funded.
 * Mirrors `budget.ts`'s `buildApplyResolver`.
 */
function buildSettleCycleResolver(
  settlements: Map<CardPurchaseId, { accountId: AccountId; subEnvelopeId: SubEnvelopeId }>,
) {
  return (purchase: CardPurchase) => {
    const settlement = settlements.get(purchase.id);
    if (settlement === undefined) {
      return null;
    }

    const fundingSubEnvelope = resolveFundingSubEnvelope(purchase);
    return {
      id: transactionIdFromString(randomUUID()),
      accountId: settlement.accountId,
      subEnvelopeId: settlement.subEnvelopeId,
      ...(fundingSubEnvelope === undefined ? {} : { fundingSubEnvelope }),
    };
  };
}

/**
 * Read-only Credit Card queries (CreditCard/CardPurchase) plus two
 * mutations. `settleCardPurchase` wraps the `@gastos/shared` domain function
 * of the same name, wiring a single funded `CardPurchase` into a real ledger
 * `Transaction` — the caller always supplies both `accountId` and
 * `subEnvelopeId` explicitly (mirrored from the domain function's own
 * contract, since a `SubEnvelope` can span multiple accounts); the domain
 * function validates them against the purchase's declared `FundingSource`
 * and its `Error` (e.g. "unfunded purchase", mismatched account/envelope)
 * propagates unwrapped, surfacing as 500/INTERNAL_SERVER_ERROR — the same
 * convention `budget.applyBudgetLine` already established. Like
 * `applyBudgetLine`, this does not mark the source `CardPurchase` as
 * "settled" — re-settling the same purchase id would create a second
 * `Transaction`; this is a known, accepted limitation, not a bug to fix
 * here.
 *
 * `settleCardCycle` is the batch "Settle cycle" mutation: the caller
 * supplies `creditCardId` plus the exact `cycleStart`/`cycleEnd` window (a
 * client computes this itself via `cardCycleContaining`, since the user may
 * be viewing a past cycle via the Prev/Next drilldown — the server does not
 * recompute "today"'s cycle), and a `settlements` list of
 * `{purchaseId, accountId, subEnvelopeId}` triples for whichever in-cycle
 * purchases it wants settled right now. Purchases belonging to
 * `creditCardId` that fall in the window but are absent from `settlements`
 * (or are unfunded) are reported back in `skippedPurchases`, not treated as
 * an error — mirroring `applyBudgetLines`'s "unlisted item = skipped"
 * semantics. Like `settleCardPurchase`, this does not mark anything as
 * settled — calling it twice for the same cycle would re-settle (and
 * double-post) any purchase included both times; a known, accepted
 * limitation, not a bug to fix here. No cycle-computation query endpoint —
 * a client calls `cardCycleContaining`/`sumCardPurchasesInCycle` from
 * `@gastos/shared` directly against the raw data returned here.
 */
export const cardsRouter = router({
  creditCards: publicProcedure.query(() => getCreditCards()),
  cardPurchases: publicProcedure.query(() => getCardPurchases()),
  settleCardPurchase: publicProcedure
    .input(
      z.object({
        purchaseId: z.string(),
        accountId: z.string(),
        subEnvelopeId: z.string(),
      }),
    )
    .mutation(({ input }) => {
      const purchase = findCardPurchase(input.purchaseId);

      const accountId: AccountId = accountIdFromString(input.accountId);
      assertIdExists(getAccounts(), accountId, `Account "${accountId}" not found`);

      const subEnvelopeId: SubEnvelopeId = subEnvelopeIdFromString(input.subEnvelopeId);
      assertIdExists(getSubEnvelopes(), subEnvelopeId, `Sub-envelope "${subEnvelopeId}" not found`);

      const fundingSubEnvelope = resolveFundingSubEnvelope(purchase);

      const transaction = settleCardPurchaseInLedger(purchase, {
        id: transactionIdFromString(randomUUID()),
        accountId,
        subEnvelopeId,
        ...(fundingSubEnvelope === undefined ? {} : { fundingSubEnvelope }),
      });
      addTransaction(transaction);
      return transaction;
    }),
  settleCardCycle: publicProcedure
    .input(
      z.object({
        creditCardId: z.string(),
        cycleStart: z.string(),
        cycleEnd: z.string(),
        settlements: z.array(
          z.object({
            purchaseId: z.string(),
            accountId: z.string(),
            subEnvelopeId: z.string(),
          }),
        ),
      }),
    )
    .mutation(({ input }) => {
      assertIdExists(
        getCreditCards(),
        input.creditCardId,
        `Credit card "${input.creditCardId}" not found`,
      );

      const cycle: CardCycle = {
        start: ledgerDateFromString(input.cycleStart),
        end: ledgerDateFromString(input.cycleEnd),
      };

      const settlements = parseAndValidateSettlements(input.settlements);
      const resolver = buildSettleCycleResolver(settlements);

      const cardPurchases = getCardPurchases().filter(
        (purchase) => purchase.creditCardId === input.creditCardId,
      );

      const result = settleCardCycleInLedger(cardPurchases, cycle, resolver);
      result.settledTransactions.forEach(addTransaction);

      return {
        settledTransactions: result.settledTransactions,
        skippedPurchases: result.skippedPurchases,
      };
    }),
});
