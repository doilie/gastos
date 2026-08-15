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
