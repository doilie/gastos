import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

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
  applyBudgetLines,
  budgetLineIdFromString,
  createBudgetLine,
  markBudgetLineApplied,
  updateBudgetLine,
  type ApplyBudgetLineInput,
  type BudgetLine,
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
      isApplied: false,
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

describe("markBudgetLineApplied", () => {
  it("sets isApplied to true, leaving every other field unchanged", () => {
    const line = createBudgetLine(baseInput());
    const applied = markBudgetLineApplied(line);
    expect(applied).toEqual({ ...line, isApplied: true });
  });

  it("is idempotent — marking an already-applied line stays isApplied: true", () => {
    const line = createBudgetLine(baseInput());
    const applied = markBudgetLineApplied(line);
    const appliedAgain = markBudgetLineApplied(applied);
    expect(appliedAgain).toEqual(applied);
  });
});

describe("updateBudgetLine", () => {
  it("applies a partial update, leaving unspecified fields unchanged", () => {
    const line = createBudgetLine(baseInput());
    const updated = updateBudgetLine(line, { description: "Updated rent" });
    expect(updated).toEqual({ ...line, description: "Updated rent" });
  });

  it("applies every updatable field at once when all are given", () => {
    const line = createBudgetLine(baseInput());
    const newPeriod: BudgetPeriod = { year: 2024, month: 6 };
    const newPaydayDate = ledgerDateFromString("2024-06-15");
    const newSubEnvelopeId = subEnvelopeIdFromString("sub-2");
    const updated = updateBudgetLine(line, {
      budgetPeriod: newPeriod,
      paydayDate: newPaydayDate,
      subEnvelopeId: newSubEnvelopeId,
      amount: centsFromInt(2500),
      description: "New rent",
    });
    expect(updated).toEqual({
      ...line,
      budgetPeriod: newPeriod,
      paydayDate: newPaydayDate,
      subEnvelopeId: newSubEnvelopeId,
      amount: centsFromInt(2500),
      description: "New rent",
    });
  });

  it("never touches id or isApplied", () => {
    const line = createBudgetLine(baseInput());
    const updated = updateBudgetLine(line, { description: "Updated rent" });
    expect(updated.id).toBe(line.id);
    expect(updated.isApplied).toBe(false);
  });

  it("trims a provided description", () => {
    const line = createBudgetLine(baseInput());
    const updated = updateBudgetLine(line, { description: "  Updated rent  " });
    expect(updated.description).toBe("Updated rent");
  });

  it("does not auto-derive budgetPeriod from a new paydayDate — the caller must supply both explicitly", () => {
    const line = createBudgetLine(baseInput());
    const updated = updateBudgetLine(line, { paydayDate: ledgerDateFromString("2024-06-15") });
    expect(updated.budgetPeriod).toEqual(budgetPeriod);
    expect(updated.paydayDate).toBe("2024-06-15");
  });
});

describe("updateBudgetLine validation/rejection", () => {
  it.each([["empty string", ""], ["whitespace-only", "   "]])(
    "throws when description is %s",
    (_label, description) => {
      const line = createBudgetLine(baseInput());
      expect(() => updateBudgetLine(line, { description })).toThrow();
    },
  );

  it("throws when amount is zero", () => {
    const line = createBudgetLine(baseInput());
    expect(() => updateBudgetLine(line, { amount: centsFromInt(0) })).toThrow();
  });

  it("throws when amount is negative", () => {
    const line = createBudgetLine(baseInput());
    expect(() => updateBudgetLine(line, { amount: centsFromInt(-100) })).toThrow();
  });

  it("throws when the line is already applied, regardless of what's being updated", () => {
    const line = markBudgetLineApplied(createBudgetLine(baseInput()));
    expect(() => updateBudgetLine(line, { description: "Updated rent" })).toThrow();
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

describe("applyBudgetLine (already applied)", () => {
  it("throws the exact already-applied message, before checking fundingSubEnvelope/account validity", () => {
    const targetSubEnvelope = createSubEnvelope({
      id: subEnvelopeIdFromString("sub-target-applied"),
      name: "Target Envelope Applied",
      groupId,
      accountIds: [accountX],
    });
    const unrelatedSubEnvelope = createSubEnvelope({
      id: subEnvelopeIdFromString("sub-unrelated-applied"),
      name: "Unrelated Envelope Applied",
      groupId,
      accountIds: [accountX],
    });

    const line = markBudgetLineApplied(
      createBudgetLine(baseInput({ subEnvelopeId: targetSubEnvelope.id })),
    );

    // Deliberately pass a MISMATCHED fundingSubEnvelope (and an accountId not
    // even a member of it) — if the already-applied check did not run first,
    // this would throw the mismatch error instead.
    expect(() =>
      applyBudgetLine(line, {
        id: transactionIdFromString("txn-already-applied"),
        accountId: accountZ,
        fundingSubEnvelope: unrelatedSubEnvelope,
      }),
    ).toThrow("applyBudgetLine: budget line is already applied");
  });
});

describe("applyBudgetLines (empty input)", () => {
  it("returns empty results for an empty line list", () => {
    const result = applyBudgetLines([], () => null);
    expect(result).toEqual({ appliedTransactions: [], skippedLines: [] });
  });
});

describe("applyBudgetLines (unconditional resolver calls)", () => {
  it("calls resolveApplyInput once per line, unconditionally (no automatic skip)", () => {
    const sharedSubEnvelope = createSubEnvelope({
      id: subEnvelopeIdFromString("sub-unconditional"),
      name: "Unconditional Envelope",
      groupId,
      accountIds: [accountX],
    });

    const lineA = createBudgetLine(
      baseInput({ id: budgetLineIdFromString("line-a"), subEnvelopeId: sharedSubEnvelope.id }),
    );
    const lineB = createBudgetLine(
      baseInput({ id: budgetLineIdFromString("line-b"), subEnvelopeId: sharedSubEnvelope.id }),
    );
    const lineC = createBudgetLine(
      baseInput({ id: budgetLineIdFromString("line-c"), subEnvelopeId: sharedSubEnvelope.id }),
    );
    const lines = [lineA, lineB, lineC];

    const resolver = vi.fn(
      (line: BudgetLine): ApplyBudgetLineInput => ({
        id: transactionIdFromString(`txn-uncond-${line.id}`),
        accountId: accountX,
        fundingSubEnvelope: sharedSubEnvelope,
      }),
    );

    const result = applyBudgetLines(lines, resolver);

    expect(resolver).toHaveBeenCalledTimes(lines.length);
    expect(result.appliedTransactions).toHaveLength(3);
    expect(result.skippedLines).toEqual([]);
  });
});

describe("applyBudgetLines (resolver defers with null)", () => {
  it("defers a line to skippedLines when resolveApplyInput returns null", () => {
    const line = createBudgetLine(baseInput());

    const result = applyBudgetLines([line], () => null);

    expect(result.skippedLines).toEqual([line]);
    expect(result.appliedTransactions).toEqual([]);
  });
});

describe("applyBudgetLines (successful application)", () => {
  it("applies a funded line whose resolver returns a valid input", () => {
    const sharedSubEnvelope = createSubEnvelope({
      id: subEnvelopeIdFromString("sub-applied"),
      name: "Applied Envelope",
      groupId,
      accountIds: [accountX, accountY],
    });

    const line = createBudgetLine(
      baseInput({ subEnvelopeId: sharedSubEnvelope.id, amount: centsFromInt(1500) }),
    );

    const result = applyBudgetLines([line], () => ({
      id: transactionIdFromString("txn-applied"),
      accountId: accountY,
      fundingSubEnvelope: sharedSubEnvelope,
    }));

    expect(result.skippedLines).toEqual([]);
    expect(result.appliedTransactions).toHaveLength(1);
    expect(result.appliedTransactions[0]).toEqual({
      id: transactionIdFromString("txn-applied"),
      date: line.paydayDate,
      description: line.description,
      categoryId: null,
      accountId: accountY,
      subEnvelopeId: line.subEnvelopeId,
      amount: 1500,
      counterTransactionId: null,
    });
  });
});

describe("applyBudgetLines (auto-skips already-applied lines)", () => {
  it("skips an already-applied line without calling resolveApplyInput for it", () => {
    const sharedSubEnvelope = createSubEnvelope({
      id: subEnvelopeIdFromString("sub-already-applied-batch"),
      name: "Already Applied Envelope",
      groupId,
      accountIds: [accountX],
    });

    const alreadyApplied = markBudgetLineApplied(
      createBudgetLine(
        baseInput({
          id: budgetLineIdFromString("line-already-applied"),
          subEnvelopeId: sharedSubEnvelope.id,
        }),
      ),
    );
    const pending = createBudgetLine(
      baseInput({ id: budgetLineIdFromString("line-pending"), subEnvelopeId: sharedSubEnvelope.id }),
    );

    const resolver = vi.fn(
      (): ApplyBudgetLineInput => ({
        id: transactionIdFromString("txn-pending"),
        accountId: accountX,
        fundingSubEnvelope: sharedSubEnvelope,
      }),
    );

    const result = applyBudgetLines([alreadyApplied, pending], resolver);

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith(pending);
    expect(result.skippedLines).toEqual([alreadyApplied]);
    expect(result.appliedTransactions).toHaveLength(1);
  });
});

describe("applyBudgetLines (mixed batch)", () => {
  it("correctly partitions a mixed batch: two applied, one deferred, in input order", () => {
    const sharedSubEnvelope = createSubEnvelope({
      id: subEnvelopeIdFromString("sub-mixed"),
      name: "Mixed Envelope",
      groupId,
      accountIds: [accountX, accountY],
    });

    const applied1 = createBudgetLine(
      baseInput({
        id: budgetLineIdFromString("line-mix-applied-1"),
        subEnvelopeId: sharedSubEnvelope.id,
        amount: centsFromInt(1000),
      }),
    );
    const deferred = createBudgetLine(
      baseInput({
        id: budgetLineIdFromString("line-mix-deferred"),
        subEnvelopeId: sharedSubEnvelope.id,
        amount: centsFromInt(2000),
      }),
    );
    const applied2 = createBudgetLine(
      baseInput({
        id: budgetLineIdFromString("line-mix-applied-2"),
        subEnvelopeId: sharedSubEnvelope.id,
        amount: centsFromInt(3000),
      }),
    );

    const resolver = (line: BudgetLine): ApplyBudgetLineInput | null => {
      if (line.id === applied1.id) {
        return {
          id: transactionIdFromString("txn-mix-applied-1"),
          accountId: accountX,
          fundingSubEnvelope: sharedSubEnvelope,
        };
      }
      if (line.id === applied2.id) {
        return {
          id: transactionIdFromString("txn-mix-applied-2"),
          accountId: accountY,
          fundingSubEnvelope: sharedSubEnvelope,
        };
      }
      return null;
    };

    const result = applyBudgetLines([applied1, deferred, applied2], resolver);

    expect(result.appliedTransactions).toHaveLength(2);
    expect(result.appliedTransactions[0]?.id).toBe(transactionIdFromString("txn-mix-applied-1"));
    expect(result.appliedTransactions[0]?.amount).toBe(1000);
    expect(result.appliedTransactions[1]?.id).toBe(transactionIdFromString("txn-mix-applied-2"));
    expect(result.appliedTransactions[1]?.amount).toBe(3000);
    expect(result.skippedLines).toEqual([deferred]);
  });
});

describe("applyBudgetLines (propagates applyBudgetLine errors)", () => {
  it("propagates applyBudgetLine's validation error when the resolver returns a mismatched fundingSubEnvelope", () => {
    const targetSubEnvelope = createSubEnvelope({
      id: subEnvelopeIdFromString("sub-target-batch"),
      name: "Target Envelope Batch",
      groupId,
      accountIds: [accountX],
    });
    const unrelatedSubEnvelope = createSubEnvelope({
      id: subEnvelopeIdFromString("sub-unrelated-batch"),
      name: "Unrelated Envelope Batch",
      groupId,
      accountIds: [accountX],
    });

    const line = createBudgetLine(baseInput({ subEnvelopeId: targetSubEnvelope.id }));

    expect(() =>
      applyBudgetLines([line], () => ({
        id: transactionIdFromString("txn-mismatch"),
        accountId: accountX,
        fundingSubEnvelope: unrelatedSubEnvelope,
      })),
    ).toThrow();
  });
});
