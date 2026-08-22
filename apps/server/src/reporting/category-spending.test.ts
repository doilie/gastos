import { describe, expect, it } from "vitest";
import {
  accountIdFromString,
  categoryIdFromString,
  centsFromInt,
  createCategory,
  createTransaction,
  ledgerDateFromString,
  subEnvelopeIdFromString,
  transactionIdFromString,
  type BudgetPeriod,
  type Category,
  type Transaction,
} from "@gastos/shared";

import { buildCategorySpendingReport } from "./category-spending";

const PERIOD: BudgetPeriod = { year: 2026, month: 8 };

const ACCOUNT_ID = accountIdFromString("account-checking");
const SUB_ENVELOPE_ID = subEnvelopeIdFromString("spendable");

const INCOME_CATEGORY: Category = createCategory({
  id: categoryIdFromString("category-income"),
  name: "Income",
  isIncome: true,
});

const GROCERIES_CATEGORY: Category = createCategory({
  id: categoryIdFromString("category-groceries"),
  name: "Groceries",
  isIncome: false,
});

const TRANSPORT_CATEGORY: Category = createCategory({
  id: categoryIdFromString("category-transport"),
  name: "Transport",
  isIncome: false,
});

const CATEGORIES: readonly Category[] = [INCOME_CATEGORY, GROCERIES_CATEGORY, TRANSPORT_CATEGORY];

function buildTransaction(input: {
  id: string;
  date: string;
  categoryId: string | null;
  amount: number;
}): Transaction {
  return createTransaction({
    id: transactionIdFromString(input.id),
    date: ledgerDateFromString(input.date),
    description: input.id,
    categoryId: input.categoryId === null ? null : categoryIdFromString(input.categoryId),
    accountId: ACCOUNT_ID,
    subEnvelopeId: SUB_ENVELOPE_ID,
    amount: centsFromInt(input.amount),
  });
}

describe("buildCategorySpendingReport: basic case", () => {
  it("sums income and per-category spending, skips null-category transactions, sorts by categoryId", () => {
    const transactions: readonly Transaction[] = [
      buildTransaction({ id: "txn-salary", date: "2026-08-01", categoryId: "category-income", amount: 500000 }),
      buildTransaction({ id: "txn-groceries-1", date: "2026-08-02", categoryId: "category-groceries", amount: -12000 }),
      buildTransaction({ id: "txn-groceries-2", date: "2026-08-03", categoryId: "category-groceries", amount: -3000 }),
      buildTransaction({ id: "txn-transport-1", date: "2026-08-04", categoryId: "category-transport", amount: -5000 }),
      buildTransaction({ id: "txn-uncategorized", date: "2026-08-05", categoryId: null, amount: -999 }),
    ];

    const report = buildCategorySpendingReport(transactions, CATEGORIES, PERIOD);

    expect(report.period).toEqual(PERIOD);
    expect(report.incomeTotal).toBe(centsFromInt(500000));
    expect(report.spendingByCategory).toEqual([
      { categoryId: categoryIdFromString("category-groceries"), total: centsFromInt(-15000) },
      { categoryId: categoryIdFromString("category-transport"), total: centsFromInt(-5000) },
    ]);
  });
});

describe("buildCategorySpendingReport: period filtering", () => {
  it("excludes a transaction whose date falls outside the given period", () => {
    const transactions: readonly Transaction[] = [
      buildTransaction({ id: "txn-in-period", date: "2026-08-10", categoryId: "category-groceries", amount: -1000 }),
      buildTransaction({ id: "txn-out-of-period", date: "2026-09-10", categoryId: "category-groceries", amount: -50000 }),
    ];

    const report = buildCategorySpendingReport(transactions, CATEGORIES, PERIOD);

    expect(report.spendingByCategory).toEqual([
      { categoryId: categoryIdFromString("category-groceries"), total: centsFromInt(-1000) },
    ]);
    expect(report.incomeTotal).toBe(centsFromInt(0));
  });
});

describe("buildCategorySpendingReport: stale/unknown categoryId", () => {
  it("silently skips a transaction whose categoryId has no matching Category, without throwing", () => {
    const transactions: readonly Transaction[] = [
      buildTransaction({
        id: "txn-stale-category",
        date: "2026-08-10",
        categoryId: "category-deleted",
        amount: -7500,
      }),
      buildTransaction({ id: "txn-groceries", date: "2026-08-11", categoryId: "category-groceries", amount: -1000 }),
    ];

    expect(() => buildCategorySpendingReport(transactions, CATEGORIES, PERIOD)).not.toThrow();

    const report = buildCategorySpendingReport(transactions, CATEGORIES, PERIOD);
    expect(report.spendingByCategory).toEqual([
      { categoryId: categoryIdFromString("category-groceries"), total: centsFromInt(-1000) },
    ]);
    expect(report.incomeTotal).toBe(centsFromInt(0));
  });
});

describe("buildCategorySpendingReport: untouched categories", () => {
  it("does not include a zero-entry for a category with no contributing transactions", () => {
    const transactions: readonly Transaction[] = [
      buildTransaction({ id: "txn-groceries", date: "2026-08-10", categoryId: "category-groceries", amount: -1000 }),
    ];

    const report = buildCategorySpendingReport(transactions, CATEGORIES, PERIOD);

    expect(report.spendingByCategory).toHaveLength(1);
    expect(report.spendingByCategory.some((entry) => entry.categoryId === TRANSPORT_CATEGORY.id)).toBe(false);
  });
});

describe("buildCategorySpendingReport: accumulation", () => {
  it("sums multiple transactions against the same non-income category rather than overwriting", () => {
    const transactions: readonly Transaction[] = [
      buildTransaction({ id: "txn-groceries-1", date: "2026-08-01", categoryId: "category-groceries", amount: -1000 }),
      buildTransaction({ id: "txn-groceries-2", date: "2026-08-15", categoryId: "category-groceries", amount: -2500 }),
      buildTransaction({ id: "txn-groceries-3", date: "2026-08-28", categoryId: "category-groceries", amount: -400 }),
    ];

    const report = buildCategorySpendingReport(transactions, CATEGORIES, PERIOD);

    expect(report.spendingByCategory).toEqual([
      { categoryId: categoryIdFromString("category-groceries"), total: centsFromInt(-3900) },
    ]);
  });
});

describe("buildCategorySpendingReport: empty inputs", () => {
  it("returns an empty report for an empty transactions array", () => {
    const report = buildCategorySpendingReport([], CATEGORIES, PERIOD);
    expect(report.spendingByCategory).toEqual([]);
    expect(report.incomeTotal).toBe(centsFromInt(0));
  });

  it("returns an empty report for an empty categories array, without throwing", () => {
    const transactions: readonly Transaction[] = [
      buildTransaction({ id: "txn-groceries", date: "2026-08-10", categoryId: "category-groceries", amount: -1000 }),
    ];

    const report = buildCategorySpendingReport(transactions, [], PERIOD);
    expect(report.spendingByCategory).toEqual([]);
    expect(report.incomeTotal).toBe(centsFromInt(0));
  });
});
