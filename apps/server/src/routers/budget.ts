import {
  type AccountId,
  accountIdFromString,
  applyBudgetLine as applyBudgetLineToLedger,
  applyBudgetLines as applyBudgetLinesToLedger,
  type ApplyBudgetLineInput,
  type BudgetLine,
  type BudgetLineId,
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
 * Looks up the `SubEnvelope` a `BudgetLine` targets, throwing `NOT_FOUND` if
 * it's missing. Shared by the single-item and batch mutations.
 */
function findFundingSubEnvelope(line: BudgetLine): SubEnvelope {
  const fundingSubEnvelope = getSubEnvelopes().find(
    (candidate) => candidate.id === line.subEnvelopeId,
  );
  if (fundingSubEnvelope === undefined) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Sub-envelope "${line.subEnvelopeId}" not found`,
    });
  }
  return fundingSubEnvelope;
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

  return { line, fundingSubEnvelope: findFundingSubEnvelope(line) };
}

/**
 * Validates every `{ budgetLineId, accountId }` pair in `applications`
 * against the seeded stores (`NOT_FOUND` for either miss), and builds a
 * `budgetLineId -> accountId` lookup for `buildApplyResolver` to consult.
 * Factored out of `applyBudgetLines` to keep it under the complexity/length
 * caps.
 */
function parseAndValidateApplications(
  applications: readonly { budgetLineId: string; accountId: string }[],
): Map<BudgetLineId, AccountId> {
  const applicationsByLineId = new Map<BudgetLineId, AccountId>();

  for (const application of applications) {
    const budgetLineId = budgetLineIdFromString(application.budgetLineId);
    assertIdExists(getBudgetLines(), budgetLineId, `BudgetLine "${budgetLineId}" not found`);

    const accountId = accountIdFromString(application.accountId);
    assertIdExists(getAccounts(), accountId, `Account "${accountId}" not found`);

    applicationsByLineId.set(budgetLineId, accountId);
  }

  return applicationsByLineId;
}

/**
 * Builds the resolver `applyBudgetLines` (the domain function) calls once
 * per seeded `BudgetLine`: lines absent from `applications` are skipped
 * (resolver returns `null`); lines present resolve to a concrete
 * `ApplyBudgetLineInput` using the caller-supplied account and the line's
 * target sub-envelope.
 */
function buildApplyResolver(
  applications: Map<BudgetLineId, AccountId>,
): (line: BudgetLine) => ApplyBudgetLineInput | null {
  return (line) => {
    const accountId = applications.get(line.id);
    if (accountId === undefined) {
      return null;
    }

    return {
      id: transactionIdFromString(randomUUID()),
      accountId,
      fundingSubEnvelope: findFundingSubEnvelope(line),
    };
  };
}

/**
 * Read-only Budget queries (PaydaySchedule/BudgetLine) plus two mutations:
 * `applyBudgetLine` applies a single seeded `BudgetLine` into the ledger
 * (mirroring `ledger.addTransaction`'s validation style), and
 * `applyBudgetLines` applies a caller-chosen subset of every seeded
 * `BudgetLine` in one call — mirroring the shared `applyBudgetLines`/
 * `settleCardCycle` "resolve per-item, report what succeeded vs. skipped"
 * pattern. Lines omitted from the batch call's `applications` list are
 * reported back as `skippedLines`, not treated as an error.
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
  applyBudgetLines: publicProcedure
    .input(
      z.object({
        applications: z.array(z.object({ budgetLineId: z.string(), accountId: z.string() })),
      }),
    )
    .mutation(({ input }) => {
      const applications = parseAndValidateApplications(input.applications);
      const resolver = buildApplyResolver(applications);

      const result = applyBudgetLinesToLedger(getBudgetLines(), resolver);
      result.appliedTransactions.forEach(addTransaction);

      return { appliedTransactions: result.appliedTransactions, skippedLines: result.skippedLines };
    }),
});
