import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { accountIdFromString } from "../reference/account";
import { categoryIdFromString } from "../reference/category";
import { creditCardIdFromString } from "../reference/credit-card";
import { ledgerDateFromString } from "../ledger-core/transaction";
import { centsFromInt, sumCents, ZERO_CENTS } from "../money";
import { cardCycleContaining } from "./card-cycle";
import { fundingSourceFromAccount, UNFUNDED_SOURCE } from "./funding-source";
import {
  cardPurchaseIdFromString,
  createCardPurchase,
  isFundedPurchase,
  sumCardPurchasesInCycle,
  type CardPurchase,
} from "./card-purchase";

const creditCardId = creditCardIdFromString("cc-1");
const categoryId = categoryIdFromString("cat-1");
const accountId = accountIdFromString("acc-1");

describe("cardPurchaseIdFromString", () => {
  it("accepts a non-empty value", () => {
    expect(cardPurchaseIdFromString("purchase-1")).toBe("purchase-1");
  });

  it.each([["empty string", ""], ["whitespace-only", "   "]])(
    "throws on %s",
    (_label, value) => {
      expect(() => cardPurchaseIdFromString(value)).toThrow();
    },
  );
});

function baseInput(
  overrides: Partial<Parameters<typeof createCardPurchase>[0]> = {},
): Parameters<typeof createCardPurchase>[0] {
  return {
    id: cardPurchaseIdFromString("purchase-1"),
    creditCardId,
    date: ledgerDateFromString("2024-06-10"),
    description: "Groceries",
    categoryId,
    amount: centsFromInt(1500),
    ...overrides,
  };
}

describe("createCardPurchase", () => {
  it("builds a valid CardPurchase, preserving all fields, defaulting fundingSource to UNFUNDED_SOURCE", () => {
    const purchase = createCardPurchase(baseInput());
    expect(purchase).toEqual({
      id: cardPurchaseIdFromString("purchase-1"),
      creditCardId,
      date: ledgerDateFromString("2024-06-10"),
      description: "Groceries",
      categoryId,
      amount: centsFromInt(1500),
      fundingSource: UNFUNDED_SOURCE,
    });
  });

  it("preserves an explicit fundingSource unchanged", () => {
    const fundingSource = fundingSourceFromAccount(accountId);
    const purchase = createCardPurchase(baseInput({ fundingSource }));
    expect(purchase.fundingSource).toEqual(fundingSource);
  });

  it("trims description", () => {
    const purchase = createCardPurchase(baseInput({ description: "  Groceries  " }));
    expect(purchase.description).toBe("Groceries");
  });

  it.each([["empty string", ""], ["whitespace-only", "   "]])(
    "throws when description is %s",
    (_label, description) => {
      expect(() => createCardPurchase(baseInput({ description }))).toThrow();
    },
  );

  it("throws when amount is zero", () => {
    expect(() => createCardPurchase(baseInput({ amount: ZERO_CENTS }))).toThrow();
  });

  it("throws when amount is negative", () => {
    expect(() => createCardPurchase(baseInput({ amount: centsFromInt(-100) }))).toThrow();
  });

  it("preserves categoryId: null as-is", () => {
    const purchase = createCardPurchase(baseInput({ categoryId: null }));
    expect(purchase.categoryId).toBeNull();
  });
});

describe("isFundedPurchase", () => {
  it("is true for a purchase built with an explicit account-funded fundingSource", () => {
    const purchase = createCardPurchase(
      baseInput({ fundingSource: fundingSourceFromAccount(accountId) }),
    );
    expect(isFundedPurchase(purchase)).toBe(true);
  });

  it("is false for a purchase built with fundingSource omitted (defaults to unfunded)", () => {
    const purchase = createCardPurchase(baseInput());
    expect(isFundedPurchase(purchase)).toBe(false);
  });

  it("is false for a purchase explicitly passed UNFUNDED_SOURCE", () => {
    const purchase = createCardPurchase(baseInput({ fundingSource: UNFUNDED_SOURCE }));
    expect(isFundedPurchase(purchase)).toBe(false);
  });
});

describe("sumCardPurchasesInCycle", () => {
  const cycle = cardCycleContaining(17, ledgerDateFromString("2024-06-10"));
  // cycle: { start: 2024-05-18, end: 2024-06-17 }

  function purchaseOn(date: string, amount: number): CardPurchase {
    return createCardPurchase(
      baseInput({ id: cardPurchaseIdFromString(`purchase-${date}`), date: ledgerDateFromString(date), amount: centsFromInt(amount) }),
    );
  }

  it("returns ZERO_CENTS for an empty purchase list", () => {
    expect(sumCardPurchasesInCycle([], cycle)).toBe(ZERO_CENTS);
  });

  it("sums only in-cycle purchases, excluding out-of-cycle ones", () => {
    const beforeCycle = purchaseOn("2024-05-17", 1000); // one day before cycle.start
    const inCycle = purchaseOn("2024-06-01", 2000);
    const afterCycle = purchaseOn("2024-06-18", 3000); // one day after cycle.end

    const total = sumCardPurchasesInCycle([beforeCycle, inCycle, afterCycle], cycle);

    expect(total).toBe(centsFromInt(2000));
    expect(total).not.toBe(sumCents([beforeCycle.amount, inCycle.amount, afterCycle.amount]));
  });

  it("sums multiple in-cycle purchases correctly", () => {
    const first = purchaseOn("2024-05-18", 1000); // cycle.start
    const second = purchaseOn("2024-06-01", 2500);
    const third = purchaseOn("2024-06-17", 500); // cycle.end
    const outOfCycle = purchaseOn("2024-06-20", 9999);

    const total = sumCardPurchasesInCycle([first, second, third, outOfCycle], cycle);

    expect(total).toBe(centsFromInt(4000));
  });
});

describe("sumCardPurchasesInCycle property-based", () => {
  const cycle = cardCycleContaining(17, ledgerDateFromString("2024-06-10"));
  const dates = [
    "2024-05-01", // outside, before
    "2024-05-18", // cycle.start
    "2024-06-01", // inside
    "2024-06-17", // cycle.end
    "2024-07-01", // outside, after
  ];

  const purchaseArb: fc.Arbitrary<CardPurchase> = fc
    .record({
      date: fc.constantFrom(...dates),
      amount: fc.integer({ min: 1, max: 100_000 }),
      index: fc.nat(),
    })
    .map(({ date, amount, index }) =>
      createCardPurchase(
        baseInput({
          id: cardPurchaseIdFromString(`purchase-${index}`),
          date: ledgerDateFromString(date),
          amount: centsFromInt(amount),
        }),
      ),
    );

  it("never exceeds the sum of all purchases' amounts, and equals the sum of the filtered-by-hand subset", () => {
    fc.assert(
      fc.property(fc.array(purchaseArb, { maxLength: 8 }), (purchases) => {
        const total = sumCardPurchasesInCycle(purchases, cycle);
        const allSum = sumCents(purchases.map((purchase) => purchase.amount));
        const expectedInCycleSum = sumCents(
          purchases
            .filter((purchase) => purchase.date >= cycle.start && purchase.date <= cycle.end)
            .map((purchase) => purchase.amount),
        );

        expect(total).toBe(expectedInCycleSum);
        expect(total).toBeLessThanOrEqual(allSum);
      }),
    );
  });
});
