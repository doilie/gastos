import {
  type Account,
  type AccountId,
  accountIdFromString,
  applyBudgetLine as applyBudgetLineToLedger,
  applyBudgetLines as applyBudgetLinesToLedger,
  type ApplyBudgetLineInput,
  type BudgetLine,
  type BudgetLineId,
  budgetLineIdFromString,
  budgetPeriodContaining,
  createBudgetLine as createBudgetLineInDomain,
  createPaydaySchedule as createPaydayScheduleInDomain,
  ledgerDateFromString,
  markBudgetLineApplied,
  parseCents,
  type PaydaySchedule,
  paydayScheduleIdFromString,
  type SubEnvelope,
  type SubEnvelopeId,
  subEnvelopeIdFromString,
  transactionIdFromString,
} from "@gastos/shared";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { publicProcedure, router } from "../trpc";
import {
  addBudgetLine,
  addPaydaySchedule,
  addTransaction,
  getAccounts,
  getBudgetLines,
  getPaydaySchedules,
  getSubEnvelopes,
  replaceBudgetLine,
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
 * Looks up the `SubEnvelope` a `BudgetLine` targets from an
 * already-fetched `subEnvelopes` list, throwing `NOT_FOUND` if it's
 * missing. Shared by the single-item and batch mutations. Takes the list
 * as a parameter (rather than calling `getSubEnvelopes()` itself) since
 * it's also called from inside the synchronous resolver
 * `applyBudgetLinesToLedger` invokes — the async store call must happen
 * once, up front, by the caller.
 */
function findFundingSubEnvelope(
  line: BudgetLine,
  subEnvelopes: readonly SubEnvelope[],
): SubEnvelope {
  const fundingSubEnvelope = subEnvelopes.find(
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
 * Takes the already-fetched `budgetLines` list as a parameter (fetched once
 * by the caller) rather than calling `getBudgetLines()` itself.
 */
function resolveBudgetLineAndSubEnvelope(
  budgetLineId: string,
  budgetLines: readonly BudgetLine[],
  subEnvelopes: readonly SubEnvelope[],
): {
  line: BudgetLine;
  fundingSubEnvelope: SubEnvelope;
} {
  const id = budgetLineIdFromString(budgetLineId);
  const line = budgetLines.find((candidate) => candidate.id === id);
  if (line === undefined) {
    throw new TRPCError({ code: "NOT_FOUND", message: `BudgetLine "${id}" not found` });
  }

  return { line, fundingSubEnvelope: findFundingSubEnvelope(line, subEnvelopes) };
}

/**
 * Validates every `{ budgetLineId, accountId }` pair in `applications`
 * against the seeded stores (`NOT_FOUND` for either miss), and builds a
 * `budgetLineId -> accountId` lookup for `buildApplyResolver` to consult.
 * Takes the already-fetched `accounts`/`budgetLines` lists as parameters
 * (fetched once by the caller) rather than calling
 * `getAccounts()`/`getBudgetLines()` itself in a loop. Factored out of
 * `applyBudgetLines` to keep it under the complexity/length caps.
 */
function parseAndValidateApplications(
  applications: readonly { budgetLineId: string; accountId: string }[],
  accounts: readonly Account[],
  budgetLines: readonly BudgetLine[],
): Map<BudgetLineId, AccountId> {
  const applicationsByLineId = new Map<BudgetLineId, AccountId>();

  for (const application of applications) {
    const budgetLineId = budgetLineIdFromString(application.budgetLineId);
    assertIdExists(budgetLines, budgetLineId, `BudgetLine "${budgetLineId}" not found`);

    const accountId = accountIdFromString(application.accountId);
    assertIdExists(accounts, accountId, `Account "${accountId}" not found`);

    applicationsByLineId.set(budgetLineId, accountId);
  }

  return applicationsByLineId;
}

/**
 * Builds the resolver `applyBudgetLines` (the domain function) calls once
 * per seeded `BudgetLine`: lines absent from `applications` are skipped
 * (resolver returns `null`); lines present resolve to a concrete
 * `ApplyBudgetLineInput` using the caller-supplied account and the line's
 * target sub-envelope. Every line the resolver resolves (returns non-`null`
 * for) is also pushed onto `appliedLines`, so the caller knows afterward
 * exactly which lines the domain function actually applied (as opposed to
 * auto-skipped for already being applied, or omitted from `applications`) —
 * the domain function calls this resolver strictly before it calls
 * `applyBudgetLine` for that same line, and either both succeed or the whole
 * batch call throws without returning, so a returned result always matches
 * `appliedLines` 1:1 with `result.appliedTransactions`. `subEnvelopes` is the
 * already-fetched list `findFundingSubEnvelope` needs, since the domain
 * function's resolver contract is synchronous.
 */
function buildApplyResolver(
  applications: Map<BudgetLineId, AccountId>,
  appliedLines: BudgetLine[],
  subEnvelopes: readonly SubEnvelope[],
): (line: BudgetLine) => ApplyBudgetLineInput | null {
  return (line) => {
    const accountId = applications.get(line.id);
    if (accountId === undefined) {
      return null;
    }

    appliedLines.push(line);
    return {
      id: transactionIdFromString(randomUUID()),
      accountId,
      fundingSubEnvelope: findFundingSubEnvelope(line, subEnvelopes),
    };
  };
}

/**
 * Read-only Budget queries (PaydaySchedule/BudgetLine) plus `createPaydaySchedule`/
 * `createBudgetLine` (the "Budget CRUD" thread's Create half — Update/Archive/Delete
 * are separate, later, not-yet-scoped increments, same sequencing the "More tab CRUD"/
 * "Envelope CRUD" threads followed) and two apply mutations:
 * `applyBudgetLine` applies a single seeded `BudgetLine` into the ledger
 * (mirroring `ledger.addTransaction`'s validation style), and
 * `applyBudgetLines` applies a caller-chosen subset of every seeded
 * `BudgetLine` in one call — mirroring the shared `applyBudgetLines`/
 * `settleCardCycle` "resolve per-item, report what succeeded vs. skipped"
 * pattern. Lines omitted from the batch call's `applications` list are
 * reported back as `skippedLines`, not treated as an error.
 *
 * A `BudgetLine` is marked `isApplied: true` (and persisted via
 * `replaceBudgetLine`) upon successful application, by both mutations.
 * Re-applying an already-applied line now throws — `applyBudgetLineToLedger`
 * rejects it (surfacing as 500, the same unwrapped-error convention as this
 * file's other domain validation failures) for the single mutation, and the
 * batch mutation's underlying `applyBudgetLinesToLedger` auto-skips it into
 * `skippedLines` instead of erroring or double-posting.
 *
 * `createBudgetLine` derives `budgetPeriod` from the given `paydayDate` via
 * `budgetPeriodContaining` rather than taking it as caller input — the domain factory
 * itself doesn't require the two to agree (a late-month payday can reasonably fund the
 * following month's period), but this creation entry point has no product need for
 * that flexibility yet, so keeping it inferred is one fewer field for the caller to
 * get right.
 */
export const budgetRouter = router({
  paydaySchedules: publicProcedure.query(async () => getPaydaySchedules()),
  budgetLines: publicProcedure.query(async () => getBudgetLines()),
  createPaydaySchedule: publicProcedure
    .input(z.object({ name: z.string(), paydayDaysOfMonth: z.array(z.number().int()).min(1) }))
    .mutation(async ({ input }) => {
      const schedule: PaydaySchedule = createPaydayScheduleInDomain({
        id: paydayScheduleIdFromString(randomUUID()),
        name: input.name,
        paydayDaysOfMonth: input.paydayDaysOfMonth,
      });
      await addPaydaySchedule(schedule);
      return schedule;
    }),
  createBudgetLine: publicProcedure
    .input(
      z.object({
        paydayDate: z.string(),
        subEnvelopeId: z.string(),
        amount: z.string(),
        description: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const subEnvelopeId: SubEnvelopeId = subEnvelopeIdFromString(input.subEnvelopeId);
      assertIdExists(await getSubEnvelopes(), subEnvelopeId, `Sub-envelope "${subEnvelopeId}" not found`);

      const paydayDate = ledgerDateFromString(input.paydayDate);
      const line: BudgetLine = createBudgetLineInDomain({
        id: budgetLineIdFromString(randomUUID()),
        budgetPeriod: budgetPeriodContaining(paydayDate),
        paydayDate,
        subEnvelopeId,
        amount: parseCents(input.amount),
        description: input.description,
      });
      await addBudgetLine(line);
      return line;
    }),
  applyBudgetLine: publicProcedure
    .input(z.object({ budgetLineId: z.string(), accountId: z.string() }))
    .mutation(async ({ input }) => {
      const [accounts, subEnvelopes, budgetLines] = await Promise.all([
        getAccounts(),
        getSubEnvelopes(),
        getBudgetLines(),
      ]);
      const { line, fundingSubEnvelope } = resolveBudgetLineAndSubEnvelope(
        input.budgetLineId,
        budgetLines,
        subEnvelopes,
      );

      const accountId = accountIdFromString(input.accountId);
      assertIdExists(accounts, accountId, `Account "${accountId}" not found`);

      const transaction = applyBudgetLineToLedger(line, {
        id: transactionIdFromString(randomUUID()),
        accountId,
        fundingSubEnvelope,
      });
      await addTransaction(transaction);
      await replaceBudgetLine(markBudgetLineApplied(line));
      return transaction;
    }),
  applyBudgetLines: publicProcedure
    .input(
      z.object({
        applications: z.array(z.object({ budgetLineId: z.string(), accountId: z.string() })),
      }),
    )
    .mutation(async ({ input }) => {
      const [accounts, subEnvelopes, budgetLines] = await Promise.all([
        getAccounts(),
        getSubEnvelopes(),
        getBudgetLines(),
      ]);
      const applications = parseAndValidateApplications(input.applications, accounts, budgetLines);
      const appliedLines: BudgetLine[] = [];
      const resolver = buildApplyResolver(applications, appliedLines, subEnvelopes);

      const result = applyBudgetLinesToLedger(budgetLines, resolver);
      for (const transaction of result.appliedTransactions) {
        await addTransaction(transaction);
      }
      for (const line of appliedLines) {
        await replaceBudgetLine(markBudgetLineApplied(line));
      }

      return { appliedTransactions: result.appliedTransactions, skippedLines: result.skippedLines };
    }),
});
