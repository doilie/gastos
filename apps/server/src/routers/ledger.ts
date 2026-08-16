import {
  type AccountId,
  accountIdFromString,
  deriveAccountBalance,
  deriveSubEnvelopeBalance,
  SPENDABLE_ENVELOPE_ID,
  type SubEnvelopeId,
  subEnvelopeIdFromString,
} from "@gastos/shared";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, router } from "../trpc";
import { getAccounts, getSubEnvelopes, getTransactions } from "../store";

/**
 * Throws a `NOT_FOUND` TRPCError unless some item in `items` has the given
 * `id`. Shared by `accountBalance`/`subEnvelopeBalance` so the "look it up,
 * 404 if missing" check isn't duplicated per procedure.
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
 * Read-only Ledger Core queries (Transaction list, Spendable envelope
 * balance, and parameterized account/sub-envelope balances). Thin wrappers
 * over the in-memory store — no business logic here, that all lives in
 * `@gastos/shared`. No mutation procedures yet.
 */
export const ledgerRouter = router({
  transactions: publicProcedure.query(() => getTransactions()),
  spendableBalance: publicProcedure.query(() =>
    deriveSubEnvelopeBalance(getTransactions(), SPENDABLE_ENVELOPE_ID),
  ),
  accountBalance: publicProcedure
    .input(z.object({ accountId: z.string() }))
    .query(({ input }) => {
      const accountId: AccountId = accountIdFromString(input.accountId);
      assertIdExists(getAccounts(), accountId, `Account "${accountId}" not found`);
      return deriveAccountBalance(getTransactions(), accountId);
    }),
  subEnvelopeBalance: publicProcedure
    .input(z.object({ subEnvelopeId: z.string() }))
    .query(({ input }) => {
      const subEnvelopeId: SubEnvelopeId = subEnvelopeIdFromString(input.subEnvelopeId);
      assertIdExists(
        getSubEnvelopes(),
        subEnvelopeId,
        `Sub-envelope "${subEnvelopeId}" not found`,
      );
      return deriveSubEnvelopeBalance(getTransactions(), subEnvelopeId);
    }),
});
