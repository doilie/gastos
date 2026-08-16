import {
  accountIdFromString,
  applyBudgetLine as applyBudgetLineToLedger,
  type BudgetLine,
  budgetLineIdFromString,
  type SubEnvelope,
  transactionIdFromString,
} from "@gastos/shared";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { publicProcedure, router } from "../trpc";
import {
  addTransaction,
  getAccounts,
  getBudgetLines,
  getPaydaySchedules,
  getSubEnvelopes,
} from "../store";

/**
 * Throws a `NOT_FOUND` TRPCError unless some item in `items` has the given
 * `id`. Small per-file copy of the same "look it up, 404 if missing" helper
 * `ledger.ts` defines — this codebase's established convention is per-file
 * duplication of this kind of helper rather than sharing it across routers.
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
 * Looks up the `BudgetLine` for `budgetLineId` and the `SubEnvelope` it
 * targets, throwing `NOT_FOUND` for either miss. Factored out of the
 * `applyBudgetLine` mutation to keep it under the complexity/length caps.
 */
function resolveBudgetLineAndSubEnvelope(budgetLineId: string): {
  line: BudgetLine;
  fundingSubEnvelope: SubEnvelope;
} {
  const id = budgetLineIdFromString(budgetLineId);
  const line = getBudgetLines().find((candidate) => candidate.id === id);
  if (line === undefined) {
    throw new TRPCError({ code: "NOT_FOUND", message: `BudgetLine "${id}" not found` });
  }

  const fundingSubEnvelope = getSubEnvelopes().find(
    (candidate) => candidate.id === line.subEnvelopeId,
  );
  if (fundingSubEnvelope === undefined) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Sub-envelope "${line.subEnvelopeId}" not found`,
    });
  }

  return { line, fundingSubEnvelope };
}

/**
 * Read-only Budget queries (PaydaySchedule/BudgetLine) plus the
 * `applyBudgetLine` mutation, which applies a single seeded `BudgetLine`
 * into the ledger (mirroring `ledger.addTransaction`'s validation style).
 * A batch "apply this whole payday" mutation is deferred to a later
 * increment, same as `cards.ts`'s own note about deferring cycle-settlement
 * endpoints.
 */
export const budgetRouter = router({
  paydaySchedules: publicProcedure.query(() => getPaydaySchedules()),
  budgetLines: publicProcedure.query(() => getBudgetLines()),
  applyBudgetLine: publicProcedure
    .input(z.object({ budgetLineId: z.string(), accountId: z.string() }))
    .mutation(({ input }) => {
      const { line, fundingSubEnvelope } = resolveBudgetLineAndSubEnvelope(input.budgetLineId);

      const accountId = accountIdFromString(input.accountId);
      assertIdExists(getAccounts(), accountId, `Account "${accountId}" not found`);

      const transaction = applyBudgetLineToLedger(line, {
        id: transactionIdFromString(randomUUID()),
        accountId,
        fundingSubEnvelope,
      });
      addTransaction(transaction);
      return transaction;
    }),
});
