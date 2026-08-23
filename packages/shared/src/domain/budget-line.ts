// BudgetLine: the allocation record — "this much of this payday's salary
// goes to this sub-envelope" (HLD §5's `BudgetPeriod ──< BudgetLine >──
// Account`, and `req/what-i-want.txt`'s "budget: tracks where the salaries
// per month will be placed in the sub-envelopes"). This is a Domain-layer
// file: it may depend on Ledger Core, Reference, and money, per the layer
// map in `packages/config/README.md`.
//
// Scope note: this increment is a single-line entity and its single-line
// application into the ledger only. Confirming a whole payday's worth of
// allocations at once (the `BudgetLine` equivalent of `settleCardCycle`) is
// a separate, later increment.

import type { BudgetPeriod } from "./budget-period";
import { type Transaction, type TransactionId, type LedgerDate, createTransaction } from "../ledger-core/transaction";
import type { AccountId } from "../reference/account";
import type { SubEnvelope, SubEnvelopeId } from "../reference/envelope";
import { type Cents, compareCents, isZeroCents, ZERO_CENTS } from "../money";

/** Branded string type: a budget-line identifier. */
export type BudgetLineId = string & { readonly __brand: "BudgetLineId" };

/**
 * Safe constructor: converts a raw `string` into `BudgetLineId`, throwing if
 * it is empty or whitespace-only.
 */
export function budgetLineIdFromString(value: string): BudgetLineId {
  if (value.trim().length === 0) {
    throw new Error("budgetLineIdFromString: value is empty or whitespace-only");
  }
  return value as BudgetLineId;
}

/**
 * A single allocation of one payday's salary toward one sub-envelope.
 * `amount` is always a positive magnitude (how much is allocated) — this is
 * distinct from `Transaction.amount`'s signed inflow/outflow convention,
 * since a `BudgetLine` is not itself a ledger posting.
 */
export interface BudgetLine {
  readonly id: BudgetLineId;
  /** Which calendar month this allocation belongs to. */
  readonly budgetPeriod: BudgetPeriod;
  /** Which specific payday this is allocated from (a `PaydaySchedule` can have multiple paydays per month). */
  readonly paydayDate: LedgerDate;
  /** Where the allocated money goes. */
  readonly subEnvelopeId: SubEnvelopeId;
  /** Always a positive magnitude: how much is allocated. */
  readonly amount: Cents;
  readonly description: string;
  /**
   * Whether this line has already been applied into the ledger (via
   * `applyBudgetLine`). Mirrors `Account.isArchived`/`SubEnvelope.isArchived`
   * as a persisted status flag. Prevents double-posting the same allocation —
   * `applyBudgetLine` rejects a line where this is already `true`.
   */
  readonly isApplied: boolean;
}

function assertNonEmptyDescription(description: string, context: string): string {
  const trimmed = description.trim();
  if (trimmed.length === 0) {
    throw new Error(`${context}: description is empty or whitespace-only`);
  }
  return trimmed;
}

function assertPositiveAmount(amount: Cents, context: string): Cents {
  if (isZeroCents(amount) || compareCents(amount, ZERO_CENTS) < 0) {
    throw new Error(`${context}: amount must be a positive allocation amount`);
  }
  return amount;
}

/**
 * Factory/validator for `BudgetLine`: trims and validates `description` is
 * non-empty, validates `amount` is strictly positive. Does not validate that
 * `paydayDate` falls within `budgetPeriod` — a late-month payday can
 * reasonably be allocated toward the following month's budget period.
 */
export function createBudgetLine(input: {
  id: BudgetLineId;
  budgetPeriod: BudgetPeriod;
  paydayDate: LedgerDate;
  subEnvelopeId: SubEnvelopeId;
  amount: Cents;
  description: string;
}): BudgetLine {
  return {
    id: input.id,
    budgetPeriod: input.budgetPeriod,
    paydayDate: input.paydayDate,
    subEnvelopeId: input.subEnvelopeId,
    amount: assertPositiveAmount(input.amount, "createBudgetLine"),
    description: assertNonEmptyDescription(input.description, "createBudgetLine"),
    isApplied: false,
  };
}

/**
 * Marks `line` as applied (`isApplied: true`). Touches nothing else on
 * `line`.
 */
export function markBudgetLineApplied(line: BudgetLine): BudgetLine {
  return { ...line, isApplied: true };
}

/** Input required to apply a `BudgetLine` into a ledger `Transaction`. */
export interface ApplyBudgetLineInput {
  readonly id: TransactionId;
  readonly accountId: AccountId;
  /** The sub-envelope the budget line targets, needed to inspect its `accountIds`. */
  readonly fundingSubEnvelope: SubEnvelope;
}

function assertNotAlreadyApplied(line: BudgetLine): void {
  if (line.isApplied) {
    throw new Error("applyBudgetLine: budget line is already applied");
  }
}

function assertFundingSubEnvelopeMatches(line: BudgetLine, fundingSubEnvelope: SubEnvelope): void {
  if (fundingSubEnvelope.id !== line.subEnvelopeId) {
    throw new Error(
      "applyBudgetLine: fundingSubEnvelope does not match the budget line's target sub-envelope",
    );
  }
}

function assertAccountBelongsToFundingSubEnvelope(
  fundingSubEnvelope: SubEnvelope,
  accountId: AccountId,
): void {
  if (!fundingSubEnvelope.accountIds.includes(accountId)) {
    throw new Error(
      "applyBudgetLine: accountId is not one of the funding sub-envelope's linked accounts",
    );
  }
}

/**
 * Applies a confirmed `BudgetLine` into a ledger `Transaction`, crediting the
 * target sub-envelope (allocating money is an inflow, no negation needed,
 * unlike `settleCardPurchase` which negates since it's a debit). The caller
 * supplies both `accountId` and the full `fundingSubEnvelope` entity
 * explicitly; this function validates them against `line`, it never derives
 * them. Throws a descriptive `Error` if `input` is inconsistent with `line`,
 * or if `line.isApplied` is already `true` — this is what makes
 * double-applying the same line impossible; callers must persist the result
 * of `markBudgetLineApplied` before this can be safely called again.
 */
export function applyBudgetLine(line: BudgetLine, input: ApplyBudgetLineInput): Transaction {
  assertNotAlreadyApplied(line);
  assertFundingSubEnvelopeMatches(line, input.fundingSubEnvelope);
  assertAccountBelongsToFundingSubEnvelope(input.fundingSubEnvelope, input.accountId);
  return createTransaction({
    id: input.id,
    date: line.paydayDate,
    description: line.description,
    categoryId: null,
    accountId: input.accountId,
    subEnvelopeId: line.subEnvelopeId,
    amount: line.amount,
  });
}

/**
 * Result of a batch "apply lines" attempt (the `BudgetLine` equivalent of
 * `CardCycleSettlementResult` from `settleCardCycle`).
 */
export interface BudgetLineApplicationResult {
  /** Ledger transactions produced for lines that were successfully applied. */
  readonly appliedTransactions: readonly Transaction[];
  /** Lines the caller chose to defer (its resolver returned `null`), not an error. */
  readonly skippedLines: readonly BudgetLine[];
}

/**
 * Attempts to apply every line in `lines`. For each line,
 * `resolveApplyInput` is asked for the concrete `ApplyBudgetLineInput` to
 * apply it with; returning `null` defers that line (pushed onto
 * `skippedLines`, not an error).
 *
 * Lines where `line.isApplied` is already `true` are skipped without even
 * calling `resolveApplyInput`, mirroring `settleCardCycle`'s auto-skip of
 * purchases with an unfunded `FundingSource` — since `applyBudgetLine` would
 * reject them anyway. This function also does not filter `lines` by
 * period/payday the way `settleCardCycle` filters purchases by `CardCycle` —
 * the caller is expected to already pass in whatever pre-scoped list of
 * lines it wants to attempt. This omission is a deliberate simplification
 * versus the Credit Card thread's batch function, not an oversight.
 *
 * Any `ApplyBudgetLineInput` returned by `resolveApplyInput` is expected to
 * be consistent with the line's declared `subEnvelopeId`; `applyBudgetLine`
 * is allowed to throw if it isn't — that's a caller bug, not a "couldn't
 * apply yet" case, so it is not caught here.
 */
export function applyBudgetLines(
  lines: readonly BudgetLine[],
  resolveApplyInput: (line: BudgetLine) => ApplyBudgetLineInput | null,
): BudgetLineApplicationResult {
  const appliedTransactions: Transaction[] = [];
  const skippedLines: BudgetLine[] = [];

  for (const line of lines) {
    if (line.isApplied) {
      skippedLines.push(line);
      continue;
    }

    const input = resolveApplyInput(line);
    if (input === null) {
      skippedLines.push(line);
      continue;
    }
    appliedTransactions.push(applyBudgetLine(line, input));
  }

  return { appliedTransactions, skippedLines };
}
