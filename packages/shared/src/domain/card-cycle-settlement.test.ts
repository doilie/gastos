import { describe, expect, it, vi } from "vitest";

import { centsFromInt } from "../money";
import { accountIdFromString } from "../reference/account";
import { categoryIdFromString } from "../reference/category";
import { creditCardIdFromString } from "../reference/credit-card";
import { subEnvelopeIdFromString } from "../reference/envelope";
import { ledgerDateFromString, transactionIdFromString } from "../ledger-core/transaction";
import { cardCycleContaining } from "./card-cycle";
import { cardPurchaseIdFromString, createCardPurchase, type CardPurchase } from "./card-purchase";
import { fundingSourceFromAccount, UNFUNDED_SOURCE } from "./funding-source";
import type { SettleCardPurchaseInput } from "./card-settlement";
import { settleCardCycle } from "./card-cycle-settlement";

const creditCardId = creditCardIdFromString("cc-1");
const categoryId = categoryIdFromString("cat-1");

const accountA = accountIdFromString("acc-a");
const accountB = accountIdFromString("acc-b");

// An arbitrary subEnvelopeId — account-funded purchases don't constrain it,
// per settleCardPurchase's account-funded validation (see card-settlement.test.ts).
const arbitrarySubEnvelopeId = subEnvelopeIdFromString("sub-arbitrary");

// cycle: { start: 2024-05-18, end: 2024-06-17 } (17th cutoff, containing 2024-06-10)
const cycle = cardCycleContaining(17, ledgerDateFromString("2024-06-10"));

function purchaseOn(
  id: string,
  date: string,
  amount: number,
  overrides: Partial<Parameters<typeof createCardPurchase>[0]> = {},
): CardPurchase {
  return createCardPurchase({
    id: cardPurchaseIdFromString(id),
    creditCardId,
    date: ledgerDateFromString(date),
    description: "Groceries",
    categoryId,
    amount: centsFromInt(amount),
    ...overrides,
  });
}

function accountFundedInput(
  txnId: string,
  accountId = accountA,
): SettleCardPurchaseInput {
  return {
    id: transactionIdFromString(txnId),
    accountId,
    subEnvelopeId: arbitrarySubEnvelopeId,
  };
}

describe("settleCardCycle (empty input)", () => {
  it("returns empty results for an empty purchase list", () => {
    const result = settleCardCycle([], cycle, () => null);
    expect(result).toEqual({ settledTransactions: [], skippedPurchases: [] });
  });
});

describe("settleCardCycle (cycle filtering)", () => {
  it("excludes out-of-cycle purchases entirely, while processing an in-cycle one normally", () => {
    const before = purchaseOn("before", "2024-05-17", 1000, {
      fundingSource: fundingSourceFromAccount(accountA),
    }); // one day before cycle.start
    const inCycle = purchaseOn("in-cycle", "2024-06-01", 2000, {
      fundingSource: fundingSourceFromAccount(accountA),
    });
    const after = purchaseOn("after", "2024-06-18", 3000, {
      fundingSource: fundingSourceFromAccount(accountA),
    }); // one day after cycle.end

    const resolver = vi.fn((purchase: CardPurchase) =>
      purchase.id === inCycle.id ? accountFundedInput("txn-in-cycle") : null,
    );

    const result = settleCardCycle([before, inCycle, after], cycle, resolver);

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith(inCycle);
    expect(result.settledTransactions).toHaveLength(1);
    expect(result.settledTransactions[0]?.amount).toBe(-2000);
    expect(result.skippedPurchases).toEqual([]);
  });
});

describe("settleCardCycle (unfunded purchases)", () => {
  it("skips unfunded purchases without ever calling resolveSettlementInput", () => {
    const unfunded = purchaseOn("unfunded", "2024-06-01", 1500); // fundingSource omitted -> UNFUNDED_SOURCE
    expect(unfunded.fundingSource).toEqual(UNFUNDED_SOURCE);

    const resolver = vi.fn(() => {
      throw new Error("resolveSettlementInput should never be called for an unfunded purchase");
    });

    const result = settleCardCycle([unfunded], cycle, resolver);

    expect(resolver).not.toHaveBeenCalled();
    expect(result.skippedPurchases).toEqual([unfunded]);
    expect(result.settledTransactions).toEqual([]);
  });
});

describe("settleCardCycle (resolver defers with null)", () => {
  it("defers a purchase to skippedPurchases when resolveSettlementInput returns null", () => {
    const purchase = purchaseOn("deferred", "2024-06-01", 1500, {
      fundingSource: fundingSourceFromAccount(accountA),
    });

    const result = settleCardCycle([purchase], cycle, () => null);

    expect(result.skippedPurchases).toEqual([purchase]);
    expect(result.settledTransactions).toEqual([]);
  });
});

describe("settleCardCycle (successful settlement)", () => {
  it("settles a funded purchase whose resolver returns a valid input", () => {
    const purchase = purchaseOn("settled", "2024-06-01", 1500, {
      fundingSource: fundingSourceFromAccount(accountA),
    });

    const result = settleCardCycle([purchase], cycle, () => accountFundedInput("txn-settled"));

    expect(result.skippedPurchases).toEqual([]);
    expect(result.settledTransactions).toHaveLength(1);
    expect(result.settledTransactions[0]).toEqual({
      id: transactionIdFromString("txn-settled"),
      date: purchase.date,
      description: purchase.description,
      categoryId,
      accountId: accountA,
      subEnvelopeId: arbitrarySubEnvelopeId,
      amount: -1500,
      counterTransactionId: null,
    });
  });
});

describe("settleCardCycle (mixed batch)", () => {
  it("correctly partitions a mixed batch: one unfunded, one deferred, one settled, in input order", () => {
    const unfunded = purchaseOn("mix-unfunded", "2024-05-20", 1000);
    const deferred = purchaseOn("mix-deferred", "2024-06-01", 2000, {
      fundingSource: fundingSourceFromAccount(accountA),
    });
    const settled = purchaseOn("mix-settled", "2024-06-05", 3000, {
      fundingSource: fundingSourceFromAccount(accountB),
    });

    const resolver = (purchase: CardPurchase): SettleCardPurchaseInput | null => {
      if (purchase.id === settled.id) {
        return accountFundedInput("txn-mix-settled", accountB);
      }
      return null;
    };

    const result = settleCardCycle([unfunded, deferred, settled], cycle, resolver);

    expect(result.settledTransactions).toHaveLength(1);
    expect(result.settledTransactions[0]?.id).toBe(transactionIdFromString("txn-mix-settled"));
    expect(result.settledTransactions[0]?.amount).toBe(-3000);
    expect(result.skippedPurchases).toEqual([unfunded, deferred]);
  });
});

describe("settleCardCycle (propagates settleCardPurchase errors)", () => {
  it("propagates settleCardPurchase's validation error when the resolver returns a mismatched accountId", () => {
    const purchase = purchaseOn("mismatched", "2024-06-01", 1500, {
      fundingSource: fundingSourceFromAccount(accountA),
    });

    expect(() =>
      settleCardCycle([purchase], cycle, () => accountFundedInput("txn-mismatch", accountB)),
    ).toThrow();
  });
});
