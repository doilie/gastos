// Credit card reference type.
//
// Per HLD §3.4 ("Card cycle | Cut-off day (17th) | 'What do I owe this card,
// and from where?'"), a credit card is reference/master data, like an
// `Account`, with a per-card configurable statement cut-off day. This is
// deliberately a field here (not a shared magic-number constant) since it
// varies per card.

import type { CurrencyCode } from "./currency";

/** Branded string type: a credit card identifier. */
export type CreditCardId = string & { readonly __brand: "CreditCardId" };

/**
 * Safe constructor: converts a raw `string` into `CreditCardId`, throwing if
 * it is empty or whitespace-only.
 */
export function creditCardIdFromString(value: string): CreditCardId {
  if (value.trim().length === 0) {
    throw new Error("creditCardIdFromString: value is empty or whitespace-only");
  }
  return value as CreditCardId;
}

/** A credit card. No balance/statement-total field — same rationale as
 * `Account` (per repo convention, CLAUDE.md, HLD decision A3): balances are
 * always derived (SUM/GROUP BY over the ledger), never stored as a column or
 * duplicated field on this type. */
export interface CreditCard {
  readonly id: CreditCardId;
  readonly name: string;
  readonly currency: CurrencyCode;
  /** Day-of-month (1–31) the statement cuts off (HLD §3.4). */
  readonly cutoffDay: number;
  readonly isArchived: boolean;
}

function assertNonEmptyName(name: string, context: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error(`${context}: name is empty or whitespace-only`);
  }
  return trimmed;
}

function assertValidCutoffDay(cutoffDay: number, context: string): number {
  if (!Number.isInteger(cutoffDay) || cutoffDay < 1 || cutoffDay > 31) {
    throw new Error(`${context}: cutoffDay must be an integer from 1 to 31`);
  }
  return cutoffDay;
}

/**
 * Factory/validator for `CreditCard`: trims and validates `name` is
 * non-empty, validates `cutoffDay` is an integer from 1 to 31, defaulting
 * `isArchived` to `false`.
 */
export function createCreditCard(input: {
  id: CreditCardId;
  name: string;
  currency: CurrencyCode;
  cutoffDay: number;
}): CreditCard {
  return {
    id: input.id,
    name: assertNonEmptyName(input.name, "createCreditCard"),
    currency: input.currency,
    cutoffDay: assertValidCutoffDay(input.cutoffDay, "createCreditCard"),
    isArchived: false,
  };
}
