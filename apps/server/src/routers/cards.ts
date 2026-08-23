import {
  type AccountId,
  accountIdFromString,
  type CardPurchase,
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
 * Read-only Credit Card queries (CreditCard/CardPurchase) plus one mutation:
 * `settleCardPurchase` wraps the `@gastos/shared` domain function of the
 * same name, wiring a single funded `CardPurchase` into a real ledger
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
 * here. No cycle-computation endpoints (a client calls
 * `cardCycleContaining`/`sumCardPurchasesInCycle` from `@gastos/shared`
 * directly against the raw data returned here), and no multi-purchase
 * "Settle cycle" batch mutation yet.
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
});
