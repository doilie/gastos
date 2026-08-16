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
  };
}

/** Input required to apply a `BudgetLine` into a ledger `Transaction`. */
export interface ApplyBudgetLineInput {
  readonly id: TransactionId;
  readonly accountId: AccountId;
  /** The sub-envelope the budget line targets, needed to inspect its `accountIds`. */
  readonly fundingSubEnvelope: SubEnvelope;
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
 * them. Throws a descriptive `Error` if `input` is inconsistent with `line`.
 */
export function applyBudgetLine(line: BudgetLine, input: ApplyBudgetLineInput): Transaction {
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
