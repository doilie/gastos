// Account reference type.
//
// Per HLD §1/§3.1 ("Accounts hold real money"), this is reference data only.
// Deliberately no balance/amount field here: per repo convention (CLAUDE.md,
// HLD decision A3), balances are always derived (SUM/GROUP BY over the
// ledger), never stored as a column or duplicated field on this type.

import type { CurrencyCode } from "./currency";

/** Branded string type: an account identifier. */
export type AccountId = string & { readonly __brand: "AccountId" };

/**
 * Safe constructor: converts a raw `string` into `AccountId`, throwing if it
 * is empty or whitespace-only.
 */
export function accountIdFromString(value: string): AccountId {
  if (value.trim().length === 0) {
    throw new Error("accountIdFromString: value is empty or whitespace-only");
  }
  return value as AccountId;
}

/** An account that holds real money. No balance field — balances are derived. */
export interface Account {
  readonly id: AccountId;
  readonly name: string;
  readonly currency: CurrencyCode;
  readonly isArchived: boolean;
}

function assertNonEmptyName(name: string, context: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error(`${context}: name is empty or whitespace-only`);
  }
  return trimmed;
}

/**
 * Factory/validator for `Account`: trims and validates `name` is non-empty,
 * defaulting `isArchived` to `false`.
 */
export function createAccount(input: {
  id: AccountId;
  name: string;
  currency: CurrencyCode;
}): Account {
  return {
    id: input.id,
    name: assertNonEmptyName(input.name, "createAccount"),
    currency: input.currency,
    isArchived: false,
  };
}

/**
 * Applies a partial `name`/`currency` update to `account`, validating `name`
 * the same way `createAccount` does when provided. `id` and `isArchived` are
 * always carried over unchanged — this function never touches either
 * (`isArchived` belongs to a separate, not-yet-scoped "Archive" increment).
 */
export function updateAccount(
  account: Account,
  updates: { name?: string; currency?: CurrencyCode },
): Account {
  return {
    ...account,
    ...(updates.name === undefined
      ? {}
      : { name: assertNonEmptyName(updates.name, "updateAccount") }),
    ...(updates.currency === undefined ? {} : { currency: updates.currency }),
  };
}

/**
 * Marks `account` as archived (`isArchived: true`). This is the "delete" for
 * an account per HLD decision A3/repo convention: a hard delete would break
 * referential integrity for historical `Transaction.accountId` values, so
 * archiving (hiding, not removing) is used instead. Touches only
 * `isArchived` — nothing else on `account` changes.
 */
export function archiveAccount(account: Account): Account {
  return { ...account, isArchived: true };
}

/**
 * Reverses `archiveAccount` (`isArchived: false`), making an archived
 * account active again. Touches only `isArchived` — nothing else on
 * `account` changes.
 */
export function unarchiveAccount(account: Account): Account {
  return { ...account, isArchived: false };
}
