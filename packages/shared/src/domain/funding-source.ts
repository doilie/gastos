// FundingSource: how a credit-card purchase gets paid (HLD §5, module M4
// "Credit Card" — "Purchases, funding links, cycles, payment allocation").
// Replaces the old spreadsheet's free-text "Paying Account" column with a
// discriminated union over three ways a card purchase can be funded:
//   - real cash from an Account
//   - an Advance Budget pre-funding from a SubEnvelope
//   - unassigned (no funding decided yet)
//
// This is the first file of the Domain layer: it may depend on Reference
// (AccountId, SubEnvelopeId) and Ledger Core, per the layer map in
// `packages/config/README.md`.

import type { AccountId } from "../reference/account";
import type { SubEnvelopeId } from "../reference/envelope";

/**
 * How a credit-card purchase gets paid. `"account"`: real cash settles the
 * card. `"envelope"`: an Advance Budget sub-envelope pre-funded it (HLD
 * prose says "envelope_id", but the money-holding envelope type in this
 * codebase is `SubEnvelope`, so the field is `subEnvelopeId`). `"none"`:
 * unassigned (was blank in the spreadsheet).
 */
export type FundingSource =
  | { readonly kind: "account"; readonly accountId: AccountId }
  | { readonly kind: "envelope"; readonly subEnvelopeId: SubEnvelopeId }
  | { readonly kind: "none" };

/** Builds a `FundingSource` funded by real cash from `accountId`. */
export function fundingSourceFromAccount(accountId: AccountId): FundingSource {
  return { kind: "account", accountId };
}

/** Builds a `FundingSource` funded by an Advance Budget sub-envelope. */
export function fundingSourceFromEnvelope(subEnvelopeId: SubEnvelopeId): FundingSource {
  return { kind: "envelope", subEnvelopeId };
}

/** The unassigned `FundingSource` (was blank in the spreadsheet). */
export const UNFUNDED_SOURCE: FundingSource = { kind: "none" };

/** True iff `source` is the `"account"` variant. */
export function isAccountFundingSource(
  source: FundingSource,
): source is Extract<FundingSource, { kind: "account" }> {
  return source.kind === "account";
}

/** True iff `source` is the `"envelope"` variant. */
export function isEnvelopeFundingSource(
  source: FundingSource,
): source is Extract<FundingSource, { kind: "envelope" }> {
  return source.kind === "envelope";
}

/** True iff `source` is the `"none"` (unassigned) variant. */
export function isUnfundedSource(
  source: FundingSource,
): source is Extract<FundingSource, { kind: "none" }> {
  return source.kind === "none";
}

/**
 * Structural equality: `true` iff `a` and `b` have the same `kind` and, for
 * variants that carry data, the same id. The `"none"` variant always
 * compares equal to another `"none"` since it carries no data.
 */
export function fundingSourcesEqual(a: FundingSource, b: FundingSource): boolean {
  switch (a.kind) {
    case "account":
      return b.kind === "account" && a.accountId === b.accountId;
    case "envelope":
      return b.kind === "envelope" && a.subEnvelopeId === b.subEnvelopeId;
    case "none":
      return b.kind === "none";
  }
}
