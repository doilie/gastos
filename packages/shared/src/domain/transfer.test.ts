import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addCents, centsFromInt, sumCents, ZERO_CENTS } from "../money";
import { accountIdFromString } from "../reference/account";
import { subEnvelopeIdFromString } from "../reference/envelope";
import {
  createTransaction,
  ledgerDateFromString,
  transactionIdFromString,
} from "../ledger-core/transaction";
import { createTransferPair, findCounterTransaction, isPairedTransaction } from "./transfer";

const outgoingId = transactionIdFromString("txn-out");
const incomingId = transactionIdFromString("txn-in");
const date = ledgerDateFromString("2024-06-01");
const fromAccountId = accountIdFromString("acc-checking");
const fromSubEnvelopeId = subEnvelopeIdFromString("sub-groceries");
const toAccountId = accountIdFromString("acc-savings");
const toSubEnvelopeId = subEnvelopeIdFromString("sub-emergency");

function buildTransferInput(amount = centsFromInt(1000)) {
  return {
    outgoingId,
    incomingId,
    date,
    description: "Move to savings",
    fromAccountId,
    fromSubEnvelopeId,
    toAccountId,
    toSubEnvelopeId,
    amount,
  };
}

describe("createTransferPair", () => {
  it("builds an outgoing leg with the negated amount, counterTransactionId pointing at the incoming leg, and categoryId: null", () => {
    const [outgoingLeg] = createTransferPair(buildTransferInput(centsFromInt(1000)));
    expect(outgoingLeg).toEqual({
      id: outgoingId,
      date,
      description: "Move to savings",
      categoryId: null,
      accountId: fromAccountId,
      subEnvelopeId: fromSubEnvelopeId,
      counterTransactionId: incomingId,
      amount: -1000,
    });
  });

  it("builds an incoming leg with the unchanged amount, counterTransactionId pointing at the outgoing leg, and categoryId: null", () => {
    const [, incomingLeg] = createTransferPair(buildTransferInput(centsFromInt(1000)));
    expect(incomingLeg).toEqual({
      id: incomingId,
      date,
      description: "Move to savings",
      categoryId: null,
      accountId: toAccountId,
      subEnvelopeId: toSubEnvelopeId,
      counterTransactionId: outgoingId,
      amount: 1000,
    });
  });

  it("throws when amount is zero", () => {
    expect(() => createTransferPair(buildTransferInput(ZERO_CENTS))).toThrow();
  });

  it("throws when amount is negative", () => {
    expect(() => createTransferPair(buildTransferInput(centsFromInt(-1000)))).toThrow();
  });

  it("throws when outgoingId === incomingId", () => {
    const input = buildTransferInput();
    expect(() =>
      createTransferPair({ ...input, outgoingId: incomingId, incomingId }),
    ).toThrow();
  });

  it("the two legs' amounts sum to zero (money moves, none is created or destroyed)", () => {
    const [outgoingLeg, incomingLeg] = createTransferPair(buildTransferInput(centsFromInt(1000)));
    expect(sumCents([outgoingLeg.amount, incomingLeg.amount])).toBe(ZERO_CENTS);
    expect(addCents(outgoingLeg.amount, incomingLeg.amount)).toBe(ZERO_CENTS);
  });
});

describe("isPairedTransaction", () => {
  it("is true for either leg returned by createTransferPair", () => {
    const [outgoingLeg, incomingLeg] = createTransferPair(buildTransferInput());
    expect(isPairedTransaction(outgoingLeg)).toBe(true);
    expect(isPairedTransaction(incomingLeg)).toBe(true);
  });

  it("is false for an ordinary (non-transfer) transaction with no counterTransactionId passed", () => {
    const transaction = createTransaction({
      id: transactionIdFromString("txn-ordinary"),
      date,
      description: "Groceries",
      categoryId: null,
      accountId: fromAccountId,
      subEnvelopeId: fromSubEnvelopeId,
      amount: centsFromInt(-500),
    });
    expect(isPairedTransaction(transaction)).toBe(false);
  });
});

describe("findCounterTransaction", () => {
  it("given a list containing both legs, looking up the outgoing leg's counter returns the incoming leg", () => {
    const [outgoingLeg, incomingLeg] = createTransferPair(buildTransferInput());
    const result = findCounterTransaction([outgoingLeg, incomingLeg], outgoingLeg);
    expect(result?.id).toBe(incomingLeg.id);
    expect(result).toEqual(incomingLeg);
  });

  it("given a list containing both legs, looking up the incoming leg's counter returns the outgoing leg", () => {
    const [outgoingLeg, incomingLeg] = createTransferPair(buildTransferInput());
    const result = findCounterTransaction([outgoingLeg, incomingLeg], incomingLeg);
    expect(result?.id).toBe(outgoingLeg.id);
    expect(result).toEqual(outgoingLeg);
  });

  it("returns null for an ordinary non-paired transaction (its counterTransactionId is null)", () => {
    const transaction = createTransaction({
      id: transactionIdFromString("txn-ordinary"),
      date,
      description: "Groceries",
      categoryId: null,
      accountId: fromAccountId,
      subEnvelopeId: fromSubEnvelopeId,
      amount: centsFromInt(-500),
    });
    expect(findCounterTransaction([transaction], transaction)).toBeNull();
  });

  it("returns null when the list doesn't actually contain the counterpart", () => {
    const [outgoingLeg] = createTransferPair(buildTransferInput());
    expect(findCounterTransaction([outgoingLeg], outgoingLeg)).toBeNull();
  });
});

describe("createTransferPair property-based", () => {
  // Keep the generator well within the safe-integer range so negateCents/
  // sumCents never spuriously overflow, mirroring the bounded-generator
  // pattern in money/index.test.ts and ledger-core/transaction.test.ts.
  const boundedPositiveCents = fc
    .integer({ min: 1, max: 1_000_000_000 })
    .map((n) => centsFromInt(n));

  it("the two legs always sum to ZERO_CENTS for any generated positive bounded amount", () => {
    fc.assert(
      fc.property(boundedPositiveCents, (amount) => {
        const [outgoingLeg, incomingLeg] = createTransferPair(buildTransferInput(amount));
        expect(sumCents([outgoingLeg.amount, incomingLeg.amount])).toBe(ZERO_CENTS);
      }),
    );
  });
});
