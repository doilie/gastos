import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { centsFromInt } from "../money";
import { accountIdFromString } from "../reference/account";
import {
  createSubEnvelope,
  envelopeGroupIdFromString,
  subEnvelopeIdFromString,
} from "../reference/envelope";
import { ledgerDateFromString, transactionIdFromString } from "../ledger-core/transaction";
import type { BudgetPeriod } from "./budget-period";
import {
  applyBudgetLine,
  budgetLineIdFromString,
  createBudgetLine,
} from "./budget-line";

const budgetPeriod: BudgetPeriod = { year: 2024, month: 5 };
const paydayDate = ledgerDateFromString("2024-05-15");

const groupId = envelopeGroupIdFromString("group-1");

const accountX = accountIdFromString("acc-x");
const accountY = accountIdFromString("acc-y");
const accountZ = accountIdFromString("acc-z"); // not a member of any envelope below

describe("budgetLineIdFromString", () => {
  it("accepts a normal non-empty string", () => {
    expect(budgetLineIdFromString("line-1")).toBe("line-1");
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only (spaces)", "   "],
    ["whitespace-only (tab)", "\t"],
  ])("rejects %s (%p)", (_label, input) => {
    expect(() => budgetLineIdFromString(input)).toThrow();
  });
});

describe("budgetLineIdFromString property-based", () => {
  it("round-trips for any generated non-empty, non-whitespace-only string", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (input) => {
          expect(budgetLineIdFromString(input)).toBe(input);
        },
      ),
    );
  });
});

function baseInput(
  overrides: Partial<Parameters<typeof createBudgetLine>[0]> = {},
): Parameters<typeof createBudgetLine>[0] {
  return {
    id: budgetLineIdFromString("line-1"),
    budgetPeriod,
    paydayDate,
    subEnvelopeId: subEnvelopeIdFromString("sub-1"),
    amount: centsFromInt(1500),
    description: "Rent",
    ...overrides,
  };
}

describe("createBudgetLine", () => {
  it("builds a valid BudgetLine, preserving all fields exactly", () => {
    const line = createBudgetLine(baseInput());
    expect(line).toEqual({
      id: budgetLineIdFromString("line-1"),
      budgetPeriod,
      paydayDate,
      subEnvelopeId: subEnvelopeIdFromString("sub-1"),
      amount: centsFromInt(1500),
      description: "Rent",
    });
  });

  it("trims description", () => {
    const line = createBudgetLine(baseInput({ description: "  Rent  " }));
    expect(line.description).toBe("Rent");
  });

  it.each([["empty string", ""], ["whitespace-only", "   "]])(
    "throws when description is %s",
    (_label, description) => {
      expect(() => createBudgetLine(baseInput({ description }))).toThrow();
    },
  );

  it("throws when amount is zero", () => {
    expect(() => createBudgetLine(baseInput({ amount: centsFromInt(0) }))).toThrow();
  });

  it("throws when amount is negative", () => {
    expect(() => createBudgetLine(baseInput({ amount: centsFromInt(-100) }))).toThrow();
  });

  it("allows a paydayDate that falls in a different month than budgetPeriod (deliberately not cross-validated)", () => {
    const line = createBudgetLine(
      baseInput({
        budgetPeriod: { year: 2024, month: 5 },
        paydayDate: ledgerDateFromString("2024-06-01"),
      }),
    );
    expect(line.budgetPeriod).toEqual({ year: 2024, month: 5 });
    expect(line.paydayDate).toBe("2024-06-01");
  });
});

describe("applyBudgetLine (success)", () => {
  it("succeeds when the funding sub-envelope matches and the account is a (non-first) member, returning the expected Transaction shape with amount unchanged/positive", () => {
    const sharedSubEnvelope = createSubEnvelope({
      id: subEnvelopeIdFromString("sub-shared"),
      name: "Shared Envelope",
      groupId,
      accountIds: [accountX, accountY],
    });

    const line = createBudgetLine(
      baseInput({ subEnvelopeId: sharedSubEnvelope.id, amount: centsFromInt(1500) }),
    );

    const transaction = applyBudgetLine(line, {
      id: transactionIdFromString("txn-1"),
      accountId: accountY, // the SECOND account in accountIds, not the first
      fundingSubEnvelope: sharedSubEnvelope,
    });

    expect(transaction).toEqual({
      id: transactionIdFromString("txn-1"),
      date: line.paydayDate,
      description: line.description,
      categoryId: null,
      accountId: accountY,
      subEnvelopeId: line.subEnvelopeId,
      amount: 1500,
      counterTransactionId: null,
    });
  });

  it("does not negate the amount (sign-convention invariant: BudgetLine credits, unlike settleCardPurchase which debits)", () => {
    const sharedSubEnvelope = createSubEnvelope({
      id: subEnvelopeIdFromString("sub-shared-2"),
      name: "Shared Envelope 2",
      groupId,
      accountIds: [accountX, accountY],
    });

    const line = createBudgetLine(
      baseInput({ subEnvelopeId: sharedSubEnvelope.id, amount: centsFromInt(1500) }),
    );

    const transaction = applyBudgetLine(line, {
      id: transactionIdFromString("txn-sign"),
      accountId: accountX,
      fundingSubEnvelope: sharedSubEnvelope,
    });

    expect(transaction.amount).toBe(1500);
    expect(transaction.amount).not.toBe(-1500);
  });
});

describe("applyBudgetLine (rejections)", () => {
  it("throws when fundingSubEnvelope's id does not match the budget line's target sub-envelope", () => {
    const targetSubEnvelope = createSubEnvelope({
      id: subEnvelopeIdFromString("sub-target"),
      name: "Target Envelope",
      groupId,
      accountIds: [accountX],
    });
    const unrelatedSubEnvelope = createSubEnvelope({
      id: subEnvelopeIdFromString("sub-unrelated"),
      name: "Unrelated Envelope",
      groupId,
      accountIds: [accountX],
    });

    const line = createBudgetLine(baseInput({ subEnvelopeId: targetSubEnvelope.id }));

    expect(() =>
      applyBudgetLine(line, {
        id: transactionIdFromString("txn-1"),
        accountId: accountX,
        fundingSubEnvelope: unrelatedSubEnvelope,
      }),
    ).toThrow();
  });

  it("throws when input.accountId is not one of fundingSubEnvelope's linked accounts", () => {
    const sharedSubEnvelope = createSubEnvelope({
      id: subEnvelopeIdFromString("sub-shared-3"),
      name: "Shared Envelope 3",
      groupId,
      accountIds: [accountX, accountY],
    });

    const line = createBudgetLine(baseInput({ subEnvelopeId: sharedSubEnvelope.id }));

    expect(() =>
      applyBudgetLine(line, {
        id: transactionIdFromString("txn-1"),
        accountId: accountZ, // not in [accountX, accountY]
        fundingSubEnvelope: sharedSubEnvelope,
      }),
    ).toThrow();
  });
});
