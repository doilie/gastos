// Envelope reference types: EnvelopeGroup and SubEnvelope.
//
// Per `req/what-i-want.txt`: envelopes are a pure organizational grouping of
// sub-envelopes and hold no money themselves. Sub-envelopes are the actual
// money-holding leaf entity, allocated over one or more accounts (per HLD
// decision A1, "Envelopes are virtual allocations over accounts"). Spendable
// is a single always-present, reserved sub-envelope with no group, tracked
// for daily available balance. There are now two reserved singleton
// sub-envelopes — Spendable and Credit Card Budget (the latter holds funds
// earmarked for upcoming credit-card statement settlement) — both following
// the identical id/name/factory/guard pattern below. No balance field on SubEnvelope — same
// rationale as `Account` (balances are always derived, decision A3).

import type { AccountId } from "./account";

/** Branded string type: an envelope group identifier. */
export type EnvelopeGroupId = string & { readonly __brand: "EnvelopeGroupId" };

/**
 * Safe constructor: converts a raw `string` into `EnvelopeGroupId`, throwing
 * if it is empty or whitespace-only.
 */
export function envelopeGroupIdFromString(value: string): EnvelopeGroupId {
  if (value.trim().length === 0) {
    throw new Error("envelopeGroupIdFromString: value is empty or whitespace-only");
  }
  return value as EnvelopeGroupId;
}

/** A pure organizational grouping of sub-envelopes. Holds no money itself. */
export interface EnvelopeGroup {
  readonly id: EnvelopeGroupId;
  readonly name: string;
}

/** Branded string type: a sub-envelope identifier. */
export type SubEnvelopeId = string & { readonly __brand: "SubEnvelopeId" };

/**
 * Safe constructor: converts a raw `string` into `SubEnvelopeId`, throwing if
 * it is empty or whitespace-only.
 */
export function subEnvelopeIdFromString(value: string): SubEnvelopeId {
  if (value.trim().length === 0) {
    throw new Error("subEnvelopeIdFromString: value is empty or whitespace-only");
  }
  return value as SubEnvelopeId;
}

/**
 * The money-holding leaf entity: where money is allocated for spending. It
 * corresponds to one or more accounts. `groupId: null` means "does not
 * belong to a user group" — used exclusively by the reserved Spendable
 * envelope; every user-created sub-envelope must have a non-null `groupId`.
 * No balance field — balances are always derived.
 */
export interface SubEnvelope {
  readonly id: SubEnvelopeId;
  readonly name: string;
  readonly groupId: EnvelopeGroupId | null;
  readonly accountIds: readonly AccountId[];
  readonly isArchived: boolean;
}

/** The single reserved identifier for the always-present Spendable envelope. */
export const SPENDABLE_ENVELOPE_ID: SubEnvelopeId = subEnvelopeIdFromString("spendable");

/** The display name for the always-present Spendable envelope. */
export const SPENDABLE_ENVELOPE_NAME = "Spendable";

/** The single reserved identifier for the always-present Credit Card Budget envelope. */
export const CREDIT_CARD_BUDGET_ENVELOPE_ID: SubEnvelopeId =
  subEnvelopeIdFromString("credit-card-budget");

/** The display name for the always-present Credit Card Budget envelope. */
export const CREDIT_CARD_BUDGET_ENVELOPE_NAME = "Credit Card Budget";

function assertNonEmptyName(name: string, context: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error(`${context}: name is empty or whitespace-only`);
  }
  return trimmed;
}

/**
 * Factory/validator for `EnvelopeGroup`: trims and validates `name` is
 * non-empty.
 */
export function createEnvelopeGroup(input: {
  id: EnvelopeGroupId;
  name: string;
}): EnvelopeGroup {
  return {
    id: input.id,
    name: assertNonEmptyName(input.name, "createEnvelopeGroup"),
  };
}

function assertNonEmptyAccountIds(
  accountIds: readonly AccountId[],
  context: string,
): readonly AccountId[] {
  if (accountIds.length === 0) {
    throw new Error(`${context}: accountIds must correspond to at least one account`);
  }
  const seen = new Set<string>();
  for (const accountId of accountIds) {
    if (seen.has(accountId)) {
      throw new Error(`${context}: accountIds contains duplicate value "${accountId}"`);
    }
    seen.add(accountId);
  }
  return accountIds;
}

/**
 * Factory/validator for a user-created `SubEnvelope`: trims and validates
 * `name` is non-empty; validates `accountIds` is non-empty and contains no
 * duplicates; rejects `id` equal to the reserved `SPENDABLE_ENVELOPE_ID` or
 * `CREDIT_CARD_BUDGET_ENVELOPE_ID`.
 */
export function createSubEnvelope(input: {
  id: SubEnvelopeId;
  name: string;
  groupId: EnvelopeGroupId;
  accountIds: readonly AccountId[];
}): SubEnvelope {
  if (input.id === SPENDABLE_ENVELOPE_ID) {
    throw new Error('createSubEnvelope: id "spendable" is reserved for the Spendable envelope');
  }
  if (input.id === CREDIT_CARD_BUDGET_ENVELOPE_ID) {
    throw new Error(
      'createSubEnvelope: id "credit-card-budget" is reserved for the Credit Card Budget envelope',
    );
  }
  return {
    id: input.id,
    name: assertNonEmptyName(input.name, "createSubEnvelope"),
    groupId: input.groupId,
    accountIds: assertNonEmptyAccountIds(input.accountIds, "createSubEnvelope"),
    isArchived: false,
  };
}

/**
 * Applies a partial `name` update to `envelopeGroup`, validating `name` the
 * same way `createEnvelopeGroup` does when provided. `id` is always carried
 * over unchanged — this function never touches it.
 */
export function updateEnvelopeGroup(
  envelopeGroup: EnvelopeGroup,
  updates: { name?: string },
): EnvelopeGroup {
  return {
    ...envelopeGroup,
    ...(updates.name === undefined
      ? {}
      : { name: assertNonEmptyName(updates.name, "updateEnvelopeGroup") }),
  };
}

/**
 * Applies a partial `name`/`accountIds` update to `subEnvelope`, validating
 * each the same way `createSubEnvelope` does when provided. `id` and
 * `groupId` are always carried over unchanged — this function never touches
 * either (moving a sub-envelope to a different group is a separate,
 * not-yet-scoped increment, same rationale as `isArchived` being excluded
 * from `updateAccount`).
 */
export function updateSubEnvelope(
  subEnvelope: SubEnvelope,
  updates: { name?: string; accountIds?: readonly AccountId[] },
): SubEnvelope {
  return {
    ...subEnvelope,
    ...(updates.name === undefined
      ? {}
      : { name: assertNonEmptyName(updates.name, "updateSubEnvelope") }),
    ...(updates.accountIds === undefined
      ? {}
      : { accountIds: assertNonEmptyAccountIds(updates.accountIds, "updateSubEnvelope") }),
  };
}

/**
 * Builds the singleton Spendable envelope: reserved id/name, no group,
 * allocated over the given accounts (validated same as `createSubEnvelope`).
 */
export function createSpendableEnvelope(accountIds: readonly AccountId[]): SubEnvelope {
  return {
    id: SPENDABLE_ENVELOPE_ID,
    name: SPENDABLE_ENVELOPE_NAME,
    groupId: null,
    accountIds: assertNonEmptyAccountIds(accountIds, "createSpendableEnvelope"),
    isArchived: false,
  };
}

/** Returns whether `subEnvelope` is the reserved Spendable envelope. */
export function isSpendableEnvelope(subEnvelope: SubEnvelope): boolean {
  return subEnvelope.id === SPENDABLE_ENVELOPE_ID;
}

/**
 * Builds the singleton Credit Card Budget envelope: reserved id/name, no
 * group, allocated over the given accounts (validated same as
 * `createSubEnvelope`).
 */
export function createCreditCardBudgetEnvelope(accountIds: readonly AccountId[]): SubEnvelope {
  return {
    id: CREDIT_CARD_BUDGET_ENVELOPE_ID,
    name: CREDIT_CARD_BUDGET_ENVELOPE_NAME,
    groupId: null,
    accountIds: assertNonEmptyAccountIds(accountIds, "createCreditCardBudgetEnvelope"),
    isArchived: false,
  };
}

/** Returns whether `subEnvelope` is the reserved Credit Card Budget envelope. */
export function isCreditCardBudgetEnvelope(subEnvelope: SubEnvelope): boolean {
  return subEnvelope.id === CREDIT_CARD_BUDGET_ENVELOPE_ID;
}

/**
 * Marks `subEnvelope` as archived (`isArchived: true`). This is the
 * "delete" for a sub-envelope per repo convention: a hard delete would break
 * referential integrity for historical `Transaction.subEnvelopeId` values,
 * so archiving (hiding, not removing) is used instead — mirrors
 * `archiveAccount`. Throws if `subEnvelope` is the reserved Spendable or
 * Credit Card Budget envelope — neither can ever be archived. Touches only
 * `isArchived` — nothing else on `subEnvelope` changes.
 */
export function archiveSubEnvelope(subEnvelope: SubEnvelope): SubEnvelope {
  if (subEnvelope.id === SPENDABLE_ENVELOPE_ID) {
    throw new Error('archiveSubEnvelope: id "spendable" is reserved for the Spendable envelope');
  }
  if (subEnvelope.id === CREDIT_CARD_BUDGET_ENVELOPE_ID) {
    throw new Error(
      'archiveSubEnvelope: id "credit-card-budget" is reserved for the Credit Card Budget envelope',
    );
  }
  return { ...subEnvelope, isArchived: true };
}

/**
 * Reverses `archiveSubEnvelope` (`isArchived: false`), making an archived
 * sub-envelope active again. Touches only `isArchived` — nothing else on
 * `subEnvelope` changes.
 */
export function unarchiveSubEnvelope(subEnvelope: SubEnvelope): SubEnvelope {
  return { ...subEnvelope, isArchived: false };
}
