// Transaction: the single write surface of the ledger (HLD §5, "Transaction
// is the single write surface. Everything else reads."). This is the first
// slice of the Ledger Core layer (HLD module M2): the type, its sign
// convention, and balance derivation. Paired postings/transfers and the
// credit-card `FundingSource` union are separate, later increments.

import type { CategoryId } from "../reference/category";
import type { AccountId } from "../reference/account";
import type { SubEnvelopeId } from "../reference/envelope";
import { type Cents, compareCents, isZeroCents, sumCents, ZERO_CENTS } from "../money";

/** Branded string type: a transaction identifier. */
export type TransactionId = string & { readonly __brand: "TransactionId" };

/**
 * Safe constructor: converts a raw `string` into `TransactionId`, throwing if
 * it is empty or whitespace-only.
 */
export function transactionIdFromString(value: string): TransactionId {
  if (value.trim().length === 0) {
    throw new Error("transactionIdFromString: value is empty or whitespace-only");
  }
  return value as TransactionId;
}

/**
 * Branded string type: a calendar date in `YYYY-MM-DD` form, no time
 * component (HLD §2.1: the ledger's core columns are Date · Description ·
 * Type · Account · Amount, and this domain never needs time-of-day).
 */
export type LedgerDate = string & { readonly __brand: "LedgerDate" };

const LEDGER_DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses the digit groups of a `YYYY-MM-DD` string, or returns null on bad shape. */
function matchLedgerDateShape(value: string): { year: number; month: number; day: number } | null {
  const match = LEDGER_DATE_SHAPE.exec(value);
  if (!match) {
    return null;
  }
  const [, yearStr, monthStr, dayStr] = match;
  if (yearStr === undefined || monthStr === undefined || dayStr === undefined) {
    return null;
  }
  return {
    year: Number.parseInt(yearStr, 10),
    month: Number.parseInt(monthStr, 10),
    day: Number.parseInt(dayStr, 10),
  };
}

/**
 * True iff `year`/`month`/`day` (1-indexed month) form a real calendar date,
 * detected by round-tripping through `Date.UTC` and confirming no rollover
 * occurred (e.g. month 13 or day 30 of February rolling into another date).
 */
function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Safe constructor: converts a raw `string` into `LedgerDate`, throwing if it
 * does not match `YYYY-MM-DD` shape or is not a real calendar date (e.g.
 * `"2024-02-30"` or `"2024-13-01"`).
 */
export function ledgerDateFromString(value: string): LedgerDate {
  const parts = matchLedgerDateShape(value);
  if (!parts || !isRealCalendarDate(parts.year, parts.month, parts.day)) {
    throw new Error(`ledgerDateFromString: not a valid YYYY-MM-DD calendar date: ${JSON.stringify(value)}`);
  }
  return value as LedgerDate;
}

/**
 * The single write surface of the ledger. `amount` is signed: positive means
 * an inflow (credit) to this account+envelope pair, negative means an
 * outflow (debit) — this sign convention is the load-bearing invariant of
 * the whole ledger (decision-adjacent to A4/A9).
 */
export interface Transaction {
  readonly id: TransactionId;
  readonly date: LedgerDate;
  readonly description: string;
  /** null: no category applies (e.g. a transfer). */
  readonly categoryId: CategoryId | null;
  /** The real account this transaction touches. */
  readonly accountId: AccountId;
  /** The envelope claim this transaction touches (HLD §3.1: a transaction names both). */
  readonly subEnvelopeId: SubEnvelopeId;
  /** Links this transaction to its paired counterpart for a transfer (HLD §2.2, "paired postings"); `null` for a non-paired transaction. */
  readonly counterTransactionId: TransactionId | null;
  /** Signed: positive = inflow (credit), negative = outflow (debit). */
  readonly amount: Cents;
}

function assertNonEmptyDescription(description: string, context: string): string {
  const trimmed = description.trim();
  if (trimmed.length === 0) {
    throw new Error(`${context}: description is empty or whitespace-only`);
  }
  return trimmed;
}

/**
 * Factory/validator for `Transaction`: trims and validates `description` is
 * non-empty. All other fields pass through unchanged.
 */
export function createTransaction(input: {
  id: TransactionId;
  date: LedgerDate;
  description: string;
  categoryId: CategoryId | null;
  accountId: AccountId;
  subEnvelopeId: SubEnvelopeId;
  counterTransactionId?: TransactionId | null;
  amount: Cents;
}): Transaction {
  return {
    id: input.id,
    date: input.date,
    description: assertNonEmptyDescription(input.description, "createTransaction"),
    categoryId: input.categoryId,
    accountId: input.accountId,
    subEnvelopeId: input.subEnvelopeId,
    counterTransactionId: input.counterTransactionId ?? null,
    amount: input.amount,
  };
}

/** True iff `transaction.amount` is strictly positive (an inflow/credit). */
export function isCredit(transaction: Transaction): boolean {
  return !isZeroCents(transaction.amount) && compareCents(transaction.amount, ZERO_CENTS) > 0;
}

/** True iff `transaction.amount` is strictly negative (an outflow/debit). */
export function isDebit(transaction: Transaction): boolean {
  return !isZeroCents(transaction.amount) && compareCents(transaction.amount, ZERO_CENTS) < 0;
}

/**
 * Derives an account's balance by summing the `amount` of every transaction
 * that touches it (decision A3: balances are always derived, never stored).
 * Returns `ZERO_CENTS` if there are no matching transactions.
 */
export function deriveAccountBalance(
  transactions: readonly Transaction[],
  accountId: AccountId,
): Cents {
  return sumCents(
    transactions.filter((transaction) => transaction.accountId === accountId).map((transaction) => transaction.amount),
  );
}

/**
 * Derives a sub-envelope's balance by summing the `amount` of every
 * transaction that touches it (decision A3: balances are always derived,
 * never stored). Returns `ZERO_CENTS` if there are no matching transactions.
 */
export function deriveSubEnvelopeBalance(
  transactions: readonly Transaction[],
  subEnvelopeId: SubEnvelopeId,
): Cents {
  return sumCents(
    transactions
      .filter((transaction) => transaction.subEnvelopeId === subEnvelopeId)
      .map((transaction) => transaction.amount),
  );
}
