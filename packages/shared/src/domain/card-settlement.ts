// CardSettlement: wiring a funded `CardPurchase` into an actual ledger
// `Transaction` (HLD §2.2, "paired postings" — "A card purchase funded from
// Savings writes a matching negative row on Savings"). This is the Domain
// layer's settlement step deferred out of the `CardPurchase` increment.
//
// Design note (confirmed): a `SubEnvelope` can span multiple real accounts
// (decision A1), and `FundingSource`'s `{kind:"account"}` variant carries no
// envelope claim while `{kind:"envelope"}` carries no specific account — so
// neither variant alone determines both `accountId` and `subEnvelopeId` that
// every `Transaction` requires. The caller always supplies both explicitly;
// `settleCardPurchase` validates them against the purchase's declared
// `FundingSource`, it never derives them.
//
// Scope note: this increment is a single-purchase settlement only. The
// multi-source "Settle cycle" payment-allocation flow (splitting a whole
// statement total across several purchases/sources) is a separate, later
// increment.

import type { CardPurchase } from "./card-purchase";
import { type Transaction, type TransactionId, createTransaction } from "../ledger-core/transaction";
import type { AccountId } from "../reference/account";
import type { SubEnvelope, SubEnvelopeId } from "../reference/envelope";
import { negateCents } from "../money";

/** Input required to settle a `CardPurchase` into a ledger `Transaction`. */
export interface SettleCardPurchaseInput {
  readonly id: TransactionId;
  readonly accountId: AccountId;
  readonly subEnvelopeId: SubEnvelopeId;
  /** Required only when `purchase.fundingSource.kind === "envelope"`. */
  readonly fundingSubEnvelope?: SubEnvelope;
}

function assertFunded(purchase: CardPurchase): void {
  if (purchase.fundingSource.kind === "none") {
    throw new Error(
      "settleCardPurchase: cannot settle an unfunded purchase — assign a FundingSource first",
    );
  }
}

function assertAccountFundingMatches(
  fundingSource: Extract<CardPurchase["fundingSource"], { kind: "account" }>,
  input: SettleCardPurchaseInput,
): void {
  if (input.accountId !== fundingSource.accountId) {
    throw new Error(
      "settleCardPurchase: accountId does not match the purchase's account-funded FundingSource",
    );
  }
}

function assertFundingSubEnvelopeProvided(
  fundingSubEnvelope: SubEnvelope | undefined,
): SubEnvelope {
  if (fundingSubEnvelope === undefined) {
    throw new Error(
      "settleCardPurchase: fundingSubEnvelope is required to settle an envelope-funded purchase",
    );
  }
  return fundingSubEnvelope;
}

function assertFundingSubEnvelopeIdMatches(
  fundingSubEnvelope: SubEnvelope,
  fundingSource: Extract<CardPurchase["fundingSource"], { kind: "envelope" }>,
): void {
  if (fundingSubEnvelope.id !== fundingSource.subEnvelopeId) {
    throw new Error(
      "settleCardPurchase: fundingSubEnvelope does not match the purchase's envelope-funded FundingSource",
    );
  }
}

function assertSubEnvelopeClaimMatches(
  subEnvelopeId: SubEnvelopeId,
  fundingSource: Extract<CardPurchase["fundingSource"], { kind: "envelope" }>,
): void {
  if (subEnvelopeId !== fundingSource.subEnvelopeId) {
    throw new Error(
      "settleCardPurchase: subEnvelopeId does not match the purchase's envelope-funded FundingSource",
    );
  }
}

function assertAccountBelongsToFundingSubEnvelope(
  fundingSubEnvelope: SubEnvelope,
  accountId: AccountId,
): void {
  if (!fundingSubEnvelope.accountIds.includes(accountId)) {
    throw new Error(
      "settleCardPurchase: accountId is not one of the funding sub-envelope's linked accounts",
    );
  }
}

function assertEnvelopeFundingMatches(
  fundingSource: Extract<CardPurchase["fundingSource"], { kind: "envelope" }>,
  input: SettleCardPurchaseInput,
): void {
  const fundingSubEnvelope = assertFundingSubEnvelopeProvided(input.fundingSubEnvelope);
  assertFundingSubEnvelopeIdMatches(fundingSubEnvelope, fundingSource);
  assertSubEnvelopeClaimMatches(input.subEnvelopeId, fundingSource);
  assertAccountBelongsToFundingSubEnvelope(fundingSubEnvelope, input.accountId);
}

function assertFundingSourceMatches(purchase: CardPurchase, input: SettleCardPurchaseInput): void {
  const { fundingSource } = purchase;
  switch (fundingSource.kind) {
    case "account":
      assertAccountFundingMatches(fundingSource, input);
      return;
    case "envelope":
      assertEnvelopeFundingMatches(fundingSource, input);
      return;
    case "none":
      // Already rejected by assertFunded above; unreachable in practice.
      return;
  }
}

/**
 * Settles a funded `CardPurchase` into a ledger `Transaction` (a single-leg
 * debit — the credit card itself isn't modeled as a ledger account in this
 * MVP, per the HLD's "no phantom account leaking into net worth"). The
 * caller supplies both `accountId` and `subEnvelopeId` explicitly; this
 * function validates them against `purchase.fundingSource`, it never derives
 * them. Throws a descriptive `Error` if `purchase` is unfunded or if `input`
 * is inconsistent with the declared `FundingSource`.
 */
export function settleCardPurchase(
  purchase: CardPurchase,
  input: SettleCardPurchaseInput,
): Transaction {
  assertFunded(purchase);
  assertFundingSourceMatches(purchase, input);
  return createTransaction({
    id: input.id,
    date: purchase.date,
    description: purchase.description,
    categoryId: purchase.categoryId,
    accountId: input.accountId,
    subEnvelopeId: input.subEnvelopeId,
    amount: negateCents(purchase.amount),
  });
}
