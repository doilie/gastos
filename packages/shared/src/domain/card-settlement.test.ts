import { describe, expect, it } from "vitest";

import { centsFromInt } from "../money";
import { accountIdFromString } from "../reference/account";
import { categoryIdFromString } from "../reference/category";
import { creditCardIdFromString } from "../reference/credit-card";
import {
  createSubEnvelope,
  envelopeGroupIdFromString,
  subEnvelopeIdFromString,
} from "../reference/envelope";
import { ledgerDateFromString, transactionIdFromString } from "../ledger-core/transaction";
import { fundingSourceFromAccount, fundingSourceFromEnvelope, UNFUNDED_SOURCE } from "./funding-source";
import { cardPurchaseIdFromString, createCardPurchase } from "./card-purchase";
import { settleCardPurchase } from "./card-settlement";

const creditCardId = creditCardIdFromString("cc-1");
const categoryId = categoryIdFromString("cat-1");
const date = ledgerDateFromString("2024-06-10");

const accountA = accountIdFromString("acc-a");
const accountB = accountIdFromString("acc-b");
const accountX = accountIdFromString("acc-x");
const accountY = accountIdFromString("acc-y");
const accountZ = accountIdFromString("acc-z"); // not a member of any envelope below

const groupId = envelopeGroupIdFromString("group-1");
const arbitrarySubEnvelopeId = subEnvelopeIdFromString("sub-arbitrary");
const otherSubEnvelopeId = subEnvelopeIdFromString("sub-other");

const sharedSubEnvelope = createSubEnvelope({
  id: subEnvelopeIdFromString("sub-shared"),
  name: "Shared Envelope",
  groupId,
  accountIds: [accountX, accountY],
});

function basePurchaseInput(
  overrides: Partial<Parameters<typeof createCardPurchase>[0]> = {},
): Parameters<typeof createCardPurchase>[0] {
  return {
    id: cardPurchaseIdFromString("purchase-1"),
    creditCardId,
    date,
    description: "Groceries",
    categoryId,
    amount: centsFromInt(1500),
    ...overrides,
  };
}

function envelopeFundedPurchase(): ReturnType<typeof createCardPurchase> {
  return createCardPurchase(
    basePurchaseInput({ fundingSource: fundingSourceFromEnvelope(sharedSubEnvelope.id) }),
  );
}

describe("settleCardPurchase (unfunded)", () => {
  it("throws when settling an unfunded purchase (fundingSource omitted, defaults to UNFUNDED_SOURCE), regardless of input", () => {
    const purchase = createCardPurchase(basePurchaseInput());
    expect(purchase.fundingSource).toEqual(UNFUNDED_SOURCE);

    expect(() =>
      settleCardPurchase(purchase, {
        id: transactionIdFromString("txn-1"),
        accountId: accountA,
        subEnvelopeId: arbitrarySubEnvelopeId,
      }),
    ).toThrow();
  });
});

describe("settleCardPurchase (account-funded)", () => {
  it("succeeds when input.accountId matches, with an arbitrary subEnvelopeId, and returns the expected Transaction shape", () => {
    const purchase = createCardPurchase(
      basePurchaseInput({ fundingSource: fundingSourceFromAccount(accountA) }),
    );

    const transaction = settleCardPurchase(purchase, {
      id: transactionIdFromString("txn-1"),
      accountId: accountA,
      subEnvelopeId: arbitrarySubEnvelopeId,
    });

    expect(transaction).toEqual({
      id: transactionIdFromString("txn-1"),
      date,
      description: "Groceries",
      categoryId,
      accountId: accountA,
      subEnvelopeId: arbitrarySubEnvelopeId,
      amount: -1500,
      counterTransactionId: null,
    });
  });

  it("throws when input.accountId does not match the funding source's account", () => {
    const purchase = createCardPurchase(
      basePurchaseInput({ fundingSource: fundingSourceFromAccount(accountA) }),
    );

    expect(() =>
      settleCardPurchase(purchase, {
        id: transactionIdFromString("txn-1"),
        accountId: accountB,
        subEnvelopeId: arbitrarySubEnvelopeId,
      }),
    ).toThrow();
  });

  it("negates the purchase's amount for the resulting Transaction's amount (settling debits the account)", () => {
    const purchase = createCardPurchase(
      basePurchaseInput({
        amount: centsFromInt(1500),
        fundingSource: fundingSourceFromAccount(accountA),
      }),
    );

    const transaction = settleCardPurchase(purchase, {
      id: transactionIdFromString("txn-sign"),
      accountId: accountA,
      subEnvelopeId: arbitrarySubEnvelopeId,
    });

    expect(transaction.amount).toBe(-1500);
  });
});

describe("settleCardPurchase (envelope-funded, success)", () => {
  it("succeeds when subEnvelopeId, fundingSubEnvelope, and a non-first member account all line up, returning the expected Transaction shape", () => {
    const purchase = envelopeFundedPurchase();

    const transaction = settleCardPurchase(purchase, {
      id: transactionIdFromString("txn-2"),
      accountId: accountY, // the SECOND account in accountIds, not the first
      subEnvelopeId: sharedSubEnvelope.id,
      fundingSubEnvelope: sharedSubEnvelope,
    });

    expect(transaction).toEqual({
      id: transactionIdFromString("txn-2"),
      date,
      description: "Groceries",
      categoryId,
      accountId: accountY,
      subEnvelopeId: sharedSubEnvelope.id,
      amount: -1500,
      counterTransactionId: null,
    });
  });
});

describe("settleCardPurchase (envelope-funded, rejections)", () => {
  it("throws when fundingSubEnvelope is omitted", () => {
    const purchase = envelopeFundedPurchase();

    expect(() =>
      settleCardPurchase(purchase, {
        id: transactionIdFromString("txn-2"),
        accountId: accountY,
        subEnvelopeId: sharedSubEnvelope.id,
      }),
    ).toThrow();
  });

  it("throws when fundingSubEnvelope's id does not match the purchase's declared FundingSource", () => {
    const purchase = envelopeFundedPurchase();
    const wrongSubEnvelope = createSubEnvelope({
      id: otherSubEnvelopeId,
      name: "Wrong Envelope",
      groupId,
      accountIds: [accountX],
    });

    expect(() =>
      settleCardPurchase(purchase, {
        id: transactionIdFromString("txn-2"),
        accountId: accountX,
        subEnvelopeId: sharedSubEnvelope.id,
        fundingSubEnvelope: wrongSubEnvelope,
      }),
    ).toThrow();
  });

  it("throws when input.subEnvelopeId does not match the funding source's subEnvelopeId", () => {
    const purchase = envelopeFundedPurchase();

    expect(() =>
      settleCardPurchase(purchase, {
        id: transactionIdFromString("txn-2"),
        accountId: accountX,
        subEnvelopeId: otherSubEnvelopeId,
        fundingSubEnvelope: sharedSubEnvelope,
      }),
    ).toThrow();
  });

  it("throws when input.accountId is not one of fundingSubEnvelope's linked accounts", () => {
    const purchase = envelopeFundedPurchase();

    expect(() =>
      settleCardPurchase(purchase, {
        id: transactionIdFromString("txn-2"),
        accountId: accountZ, // not in [accountX, accountY]
        subEnvelopeId: sharedSubEnvelope.id,
        fundingSubEnvelope: sharedSubEnvelope,
      }),
    ).toThrow();
  });
});
