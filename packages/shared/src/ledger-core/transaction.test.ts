import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { centsFromInt, sumCents, ZERO_CENTS } from "../money";
import { accountIdFromString } from "../reference/account";
import { categoryIdFromString } from "../reference/category";
import { subEnvelopeIdFromString } from "../reference/envelope";
import {
  createTransaction,
  deriveAccountBalance,
  deriveSubEnvelopeBalance,
  isCredit,
  isDebit,
  ledgerDateFromString,
  transactionIdFromString,
  updateTransaction,
} from "./transaction";

describe("transactionIdFromString", () => {
  it("accepts a normal non-empty string", () => {
    expect(transactionIdFromString("txn-1")).toBe("txn-1");
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only (spaces)", "   "],
    ["whitespace-only (tab)", "\t"],
  ])("rejects %s (%p)", (_label, input) => {
    expect(() => transactionIdFromString(input)).toThrow();
  });
});

describe("transactionIdFromString property-based", () => {
  it("round-trips for any generated non-empty, non-whitespace-only string", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (input) => {
          expect(transactionIdFromString(input)).toBe(input);
        },
      ),
    );
  });
});

describe("ledgerDateFromString", () => {
  it.each([
    ["a 31-day month (January)", "2024-01-15"],
    ["a 30-day month (April)", "2024-04-30"],
    ["February in a leap year, including the leap day", "2024-02-29"],
    ["February in a non-leap year", "2023-02-28"],
    ["a December date", "2023-12-31"],
  ])("accepts %s (%p)", (_label, input) => {
    expect(ledgerDateFromString(input)).toBe(input);
  });

  it.each([
    ["February 30th (doesn't exist)", "2024-02-30"],
    ["month 13", "2024-13-01"],
    ["month 00", "2024-00-15"],
    ["April 31st (April has 30 days)", "2024-04-31"],
    ["Feb 29th in a non-leap year", "2023-02-29"],
    ["unpadded month/day", "2024-1-5"],
    ["no separators", "20240115"],
    ["wrong separator", "2024/01/15"],
    ["empty string", ""],
  ])("rejects %s (%p)", (_label, input) => {
    expect(() => ledgerDateFromString(input)).toThrow();
  });
});

describe("createTransaction", () => {
  const id = transactionIdFromString("txn-1");
  const date = ledgerDateFromString("2024-06-01");
  const accountId = accountIdFromString("acc-1");
  const subEnvelopeId = subEnvelopeIdFromString("sub-1");
  const categoryId = categoryIdFromString("cat-1");

  it("builds a valid Transaction, preserving all fields, with categoryId: null (e.g. a transfer)", () => {
    const transaction = createTransaction({
      id,
      date,
      description: "Transfer",
      categoryId: null,
      accountId,
      subEnvelopeId,
      amount: centsFromInt(1000),
    });
    expect(transaction).toEqual({
      id,
      date,
      description: "Transfer",
      categoryId: null,
      accountId,
      subEnvelopeId,
      counterTransactionId: null,
      amount: 1000,
    });
  });

  it("builds a valid Transaction, preserving all fields, with a categoryId set", () => {
    const transaction = createTransaction({
      id,
      date,
      description: "Groceries",
      categoryId,
      accountId,
      subEnvelopeId,
      amount: centsFromInt(-500),
    });
    expect(transaction).toEqual({
      id,
      date,
      description: "Groceries",
      categoryId,
      accountId,
      subEnvelopeId,
      counterTransactionId: null,
      amount: -500,
    });
  });

});

describe("createTransaction counterTransactionId", () => {
  const id = transactionIdFromString("txn-1");
  const date = ledgerDateFromString("2024-06-01");
  const accountId = accountIdFromString("acc-1");
  const subEnvelopeId = subEnvelopeIdFromString("sub-1");
  const categoryId = categoryIdFromString("cat-1");

  it("defaults counterTransactionId to null when omitted", () => {
    const transaction = createTransaction({
      id,
      date,
      description: "Groceries",
      categoryId,
      accountId,
      subEnvelopeId,
      amount: centsFromInt(-500),
    });
    expect(transaction.counterTransactionId).toBeNull();
  });

  it("preserves an explicit counterTransactionId unchanged in the output", () => {
    const counterTransactionId = transactionIdFromString("txn-2");
    const transaction = createTransaction({
      id,
      date,
      description: "Transfer",
      categoryId: null,
      accountId,
      subEnvelopeId,
      counterTransactionId,
      amount: centsFromInt(1000),
    });
    expect(transaction).toEqual({
      id,
      date,
      description: "Transfer",
      categoryId: null,
      accountId,
      subEnvelopeId,
      counterTransactionId,
      amount: 1000,
    });
  });
});

describe("createTransaction description validation", () => {
  const id = transactionIdFromString("txn-1");
  const date = ledgerDateFromString("2024-06-01");
  const accountId = accountIdFromString("acc-1");
  const subEnvelopeId = subEnvelopeIdFromString("sub-1");

  it("trims leading/trailing whitespace from description", () => {
    const transaction = createTransaction({
      id,
      date,
      description: "  Groceries  ",
      categoryId: null,
      accountId,
      subEnvelopeId,
      amount: centsFromInt(-500),
    });
    expect(transaction.description).toBe("Groceries");
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only", "   "],
  ])("throws on %s description (%p)", (_label, description) => {
    expect(() =>
      createTransaction({
        id,
        date,
        description,
        categoryId: null,
        accountId,
        subEnvelopeId,
        amount: centsFromInt(100),
      }),
    ).toThrow();
  });
});

const updateTransactionFixtureId = transactionIdFromString("txn-1");
const updateTransactionFixtureDate = ledgerDateFromString("2024-06-01");
const updateTransactionFixtureOtherDate = ledgerDateFromString("2024-07-15");
const updateTransactionFixtureAccountId = accountIdFromString("acc-1");
const updateTransactionFixtureOtherAccountId = accountIdFromString("acc-2");
const updateTransactionFixtureSubEnvelopeId = subEnvelopeIdFromString("sub-1");
const updateTransactionFixtureOtherSubEnvelopeId = subEnvelopeIdFromString("sub-2");
const updateTransactionFixtureCategoryId = categoryIdFromString("cat-1");
const updateTransactionFixtureOtherCategoryId = categoryIdFromString("cat-2");

describe("updateTransaction single-field updates", () => {
  const id = updateTransactionFixtureId;
  const date = updateTransactionFixtureDate;
  const otherDate = updateTransactionFixtureOtherDate;
  const accountId = updateTransactionFixtureAccountId;
  const subEnvelopeId = updateTransactionFixtureSubEnvelopeId;
  const categoryId = updateTransactionFixtureCategoryId;
  const transaction = createTransaction({
    id,
    date,
    description: "Groceries",
    categoryId,
    accountId,
    subEnvelopeId,
    amount: centsFromInt(-500),
  });

  it("updates only date, leaving everything else unchanged", () => {
    const updated = updateTransaction(transaction, { date: otherDate });
    expect(updated.date).toBe(otherDate);
    expect(updated.description).toBe(transaction.description);
    expect(updated.categoryId).toBe(transaction.categoryId);
    expect(updated.accountId).toBe(transaction.accountId);
    expect(updated.subEnvelopeId).toBe(transaction.subEnvelopeId);
    expect(updated.amount).toBe(transaction.amount);
    expect(updated.id).toBe(transaction.id);
  });

  it("updates only description, leaving everything else unchanged", () => {
    const updated = updateTransaction(transaction, { description: "Updated groceries" });
    expect(updated.description).toBe("Updated groceries");
    expect(updated.date).toBe(transaction.date);
    expect(updated.categoryId).toBe(transaction.categoryId);
    expect(updated.accountId).toBe(transaction.accountId);
    expect(updated.subEnvelopeId).toBe(transaction.subEnvelopeId);
    expect(updated.amount).toBe(transaction.amount);
  });

});

describe("updateTransaction single-field updates, continued", () => {
  const id = updateTransactionFixtureId;
  const date = updateTransactionFixtureDate;
  const accountId = updateTransactionFixtureAccountId;
  const otherAccountId = updateTransactionFixtureOtherAccountId;
  const subEnvelopeId = updateTransactionFixtureSubEnvelopeId;
  const otherSubEnvelopeId = updateTransactionFixtureOtherSubEnvelopeId;
  const categoryId = updateTransactionFixtureCategoryId;
  const transaction = createTransaction({
    id,
    date,
    description: "Groceries",
    categoryId,
    accountId,
    subEnvelopeId,
    amount: centsFromInt(-500),
  });

  it("updates only accountId, leaving everything else unchanged", () => {
    const updated = updateTransaction(transaction, { accountId: otherAccountId });
    expect(updated.accountId).toBe(otherAccountId);
    expect(updated.date).toBe(transaction.date);
    expect(updated.description).toBe(transaction.description);
    expect(updated.categoryId).toBe(transaction.categoryId);
    expect(updated.subEnvelopeId).toBe(transaction.subEnvelopeId);
    expect(updated.amount).toBe(transaction.amount);
  });

  it("updates only subEnvelopeId, leaving everything else unchanged", () => {
    const updated = updateTransaction(transaction, { subEnvelopeId: otherSubEnvelopeId });
    expect(updated.subEnvelopeId).toBe(otherSubEnvelopeId);
    expect(updated.date).toBe(transaction.date);
    expect(updated.description).toBe(transaction.description);
    expect(updated.categoryId).toBe(transaction.categoryId);
    expect(updated.accountId).toBe(transaction.accountId);
    expect(updated.amount).toBe(transaction.amount);
  });

  it("updates only amount, leaving everything else unchanged", () => {
    const updated = updateTransaction(transaction, { amount: centsFromInt(12345) });
    expect(updated.amount).toBe(12345);
    expect(updated.date).toBe(transaction.date);
    expect(updated.description).toBe(transaction.description);
    expect(updated.categoryId).toBe(transaction.categoryId);
    expect(updated.accountId).toBe(transaction.accountId);
    expect(updated.subEnvelopeId).toBe(transaction.subEnvelopeId);
  });
});

describe("updateTransaction multi-field, no-op, and description validation", () => {
  const id = updateTransactionFixtureId;
  const date = updateTransactionFixtureDate;
  const otherDate = updateTransactionFixtureOtherDate;
  const accountId = updateTransactionFixtureAccountId;
  const otherAccountId = updateTransactionFixtureOtherAccountId;
  const subEnvelopeId = updateTransactionFixtureSubEnvelopeId;
  const categoryId = updateTransactionFixtureCategoryId;
  const transaction = createTransaction({
    id,
    date,
    description: "Groceries",
    categoryId,
    accountId,
    subEnvelopeId,
    amount: centsFromInt(-500),
  });

  it("updates multiple fields at once", () => {
    const updated = updateTransaction(transaction, {
      date: otherDate,
      description: "Updated groceries",
      accountId: otherAccountId,
      amount: centsFromInt(12345),
    });
    expect(updated).toEqual({
      id,
      date: otherDate,
      description: "Updated groceries",
      categoryId: transaction.categoryId,
      accountId: otherAccountId,
      subEnvelopeId: transaction.subEnvelopeId,
      counterTransactionId: null,
      amount: 12345,
    });
  });

  it("is a no-op when updates is an empty object", () => {
    const updated = updateTransaction(transaction, {});
    expect(updated).toEqual(transaction);
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only", "   "],
  ])("throws on %s description (%p)", (_label, description) => {
    expect(() => updateTransaction(transaction, { description })).toThrow();
  });
});

describe("updateTransaction categoryId nullability", () => {
  const id = updateTransactionFixtureId;
  const date = updateTransactionFixtureDate;
  const accountId = updateTransactionFixtureAccountId;
  const subEnvelopeId = updateTransactionFixtureSubEnvelopeId;
  const categoryId = updateTransactionFixtureCategoryId;
  const otherCategoryId = updateTransactionFixtureOtherCategoryId;
  const transaction = createTransaction({
    id,
    date,
    description: "Groceries",
    categoryId,
    accountId,
    subEnvelopeId,
    amount: centsFromInt(-500),
  });

  it("clears categoryId when updated to null from a real category", () => {
    const updated = updateTransaction(transaction, { categoryId: null });
    expect(updated.categoryId).toBeNull();
    expect(updated.date).toBe(transaction.date);
    expect(updated.description).toBe(transaction.description);
    expect(updated.accountId).toBe(transaction.accountId);
    expect(updated.subEnvelopeId).toBe(transaction.subEnvelopeId);
    expect(updated.amount).toBe(transaction.amount);
  });

  it("sets categoryId when updated from null to a real category", () => {
    const noCategoryTransaction = createTransaction({
      id,
      date,
      description: "Transfer",
      categoryId: null,
      accountId,
      subEnvelopeId,
      amount: centsFromInt(1000),
    });
    const updated = updateTransaction(noCategoryTransaction, { categoryId: otherCategoryId });
    expect(updated.categoryId).toBe(otherCategoryId);
  });
});

describe("updateTransaction id/counterTransactionId immutability", () => {
  const id = updateTransactionFixtureId;
  const date = updateTransactionFixtureDate;
  const otherDate = updateTransactionFixtureOtherDate;
  const accountId = updateTransactionFixtureAccountId;
  const otherAccountId = updateTransactionFixtureOtherAccountId;
  const subEnvelopeId = updateTransactionFixtureSubEnvelopeId;
  const otherSubEnvelopeId = updateTransactionFixtureOtherSubEnvelopeId;

  it("never changes id or counterTransactionId, even when other fields are updated", () => {
    const counterTransactionId = transactionIdFromString("txn-2");
    const pairedTransaction = createTransaction({
      id,
      date,
      description: "Transfer",
      categoryId: null,
      accountId,
      subEnvelopeId,
      counterTransactionId,
      amount: centsFromInt(1000),
    });
    const updated = updateTransaction(pairedTransaction, {
      date: otherDate,
      description: "Updated transfer",
      accountId: otherAccountId,
      subEnvelopeId: otherSubEnvelopeId,
      amount: centsFromInt(-1000),
    });
    expect(updated.id).toBe(pairedTransaction.id);
    expect(updated.counterTransactionId).toBe(counterTransactionId);
  });
});

describe("isCredit / isDebit", () => {
  const id = transactionIdFromString("txn-1");
  const date = ledgerDateFromString("2024-06-01");
  const accountId = accountIdFromString("acc-1");
  const subEnvelopeId = subEnvelopeIdFromString("sub-1");

  function buildTransaction(amount: number) {
    return createTransaction({
      id,
      date,
      description: "Test",
      categoryId: null,
      accountId,
      subEnvelopeId,
      amount: centsFromInt(amount),
    });
  }

  it("a positive-amount transaction is a credit and not a debit", () => {
    const transaction = buildTransaction(500);
    expect(isCredit(transaction)).toBe(true);
    expect(isDebit(transaction)).toBe(false);
  });

  it("a negative-amount transaction is a debit and not a credit", () => {
    const transaction = buildTransaction(-500);
    expect(isCredit(transaction)).toBe(false);
    expect(isDebit(transaction)).toBe(true);
  });

  it("a zero-amount transaction is neither a credit nor a debit", () => {
    const transaction = buildTransaction(0);
    expect(isCredit(transaction)).toBe(false);
    expect(isDebit(transaction)).toBe(false);
  });
});

describe("deriveAccountBalance / deriveSubEnvelopeBalance", () => {
  const acc1 = accountIdFromString("acc-1");
  const acc2 = accountIdFromString("acc-2");
  const sub1 = subEnvelopeIdFromString("sub-1");
  const sub2 = subEnvelopeIdFromString("sub-2");

  function buildTransaction(
    idSuffix: string,
    accountId: ReturnType<typeof accountIdFromString>,
    subEnvelopeId: ReturnType<typeof subEnvelopeIdFromString>,
    amount: number,
  ) {
    return createTransaction({
      id: transactionIdFromString(`txn-${idSuffix}`),
      date: ledgerDateFromString("2024-06-01"),
      description: "Test",
      categoryId: null,
      accountId,
      subEnvelopeId,
      amount: centsFromInt(amount),
    });
  }

  it("deriveAccountBalance returns ZERO_CENTS for an empty transaction list", () => {
    expect(deriveAccountBalance([], acc1)).toBe(ZERO_CENTS);
  });

  it("deriveSubEnvelopeBalance returns ZERO_CENTS for an empty transaction list", () => {
    expect(deriveSubEnvelopeBalance([], sub1)).toBe(ZERO_CENTS);
  });

  it("deriveAccountBalance sums only transactions matching the target account, excluding a different account", () => {
    const transactions = [
      buildTransaction("1", acc1, sub1, 1000),
      buildTransaction("2", acc1, sub1, -300),
      buildTransaction("3", acc2, sub1, 5000),
    ];
    expect(deriveAccountBalance(transactions, acc1)).toBe(700);
    expect(deriveAccountBalance(transactions, acc2)).toBe(5000);
  });

  it("deriveSubEnvelopeBalance sums only transactions matching the target sub-envelope, excluding a different sub-envelope", () => {
    const transactions = [
      buildTransaction("1", acc1, sub1, 1000),
      buildTransaction("2", acc1, sub1, -300),
      buildTransaction("3", acc1, sub2, 5000),
    ];
    expect(deriveSubEnvelopeBalance(transactions, sub1)).toBe(700);
    expect(deriveSubEnvelopeBalance(transactions, sub2)).toBe(5000);
  });

  it("deriveAccountBalance handles multiple matching transactions with mixed signs", () => {
    const transactions = [
      buildTransaction("1", acc1, sub1, 100),
      buildTransaction("2", acc1, sub2, -50),
      buildTransaction("3", acc1, sub1, -25),
      buildTransaction("4", acc2, sub1, 999),
    ];
    expect(deriveAccountBalance(transactions, acc1)).toBe(25);
  });
});

describe("reconciliation invariant (property-based)", () => {
  // Small, fixed id sets so the same accounts/envelopes recur across
  // generated transactions -- this is what makes summing meaningful, per
  // HLD §3.1: "the sum of all envelope claims on an account must equal
  // that account's real bank balance."
  const accountIds = [accountIdFromString("acc-1"), accountIdFromString("acc-2"), accountIdFromString("acc-3")];
  const subEnvelopeIds = [subEnvelopeIdFromString("sub-1"), subEnvelopeIdFromString("sub-2")];

  const transactionArb = fc
    .record({
      idSuffix: fc.uuid(),
      accountId: fc.constantFrom(...accountIds),
      subEnvelopeId: fc.constantFrom(...subEnvelopeIds),
      amount: fc.integer({ min: -1_000_000, max: 1_000_000 }),
    })
    .map(({ idSuffix, accountId, subEnvelopeId, amount }) =>
      createTransaction({
        id: transactionIdFromString(`txn-${idSuffix}`),
        date: ledgerDateFromString("2024-06-01"),
        description: "Generated",
        categoryId: null,
        accountId,
        subEnvelopeId,
        amount: centsFromInt(amount),
      }),
    );

  it("sum of per-account balances equals sum of per-sub-envelope balances equals the grand total", () => {
    fc.assert(
      fc.property(fc.array(transactionArb, { minLength: 0, maxLength: 50 }), (transactions) => {
        const grandTotal = sumCents(transactions.map((transaction) => transaction.amount));

        const accountTotal = sumCents(
          accountIds.map((accountId) => deriveAccountBalance(transactions, accountId)),
        );
        const subEnvelopeTotal = sumCents(
          subEnvelopeIds.map((subEnvelopeId) => deriveSubEnvelopeBalance(transactions, subEnvelopeId)),
        );

        expect(accountTotal).toBe(grandTotal);
        expect(subEnvelopeTotal).toBe(grandTotal);
      }),
    );
  });
});
