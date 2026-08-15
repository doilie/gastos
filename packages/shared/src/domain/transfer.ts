// Transfer: paired postings between accounts/envelopes (HLD §2.2, "Paired
// postings. A card purchase funded from Savings writes a matching negative
// row on Savings. Manual, but conceptually correct.") and module map M5
// ("Transfers & Allocations — Paired postings, payday allocation, FX
// conversion"). This is a Domain-layer file: it may depend on Ledger Core,
// Reference, and money, per the layer map in `packages/config/README.md`.

import {
  type LedgerDate,
  type Transaction,
  type TransactionId,
  createTransaction,
} from "../ledger-core/transaction";
import type { AccountId } from "../reference/account";
import type { SubEnvelopeId } from "../reference/envelope";
import { type Cents, compareCents, isZeroCents, negateCents, ZERO_CENTS } from "../money";

function assertPositiveTransferAmount(amount: Cents): void {
  if (isZeroCents(amount) || compareCents(amount, ZERO_CENTS) < 0) {
    throw new Error("createTransferPair: amount must be a positive transfer size");
  }
}

function assertDistinctLegIds(outgoingId: TransactionId, incomingId: TransactionId): void {
  if (outgoingId === incomingId) {
    throw new Error("createTransferPair: outgoingId and incomingId must be distinct");
  }
}

/**
 * Builds the two linked `Transaction`s representing one transfer (HLD §2.2:
 * "a matching negative row"). The outgoing leg debits `fromAccountId`/
 * `fromSubEnvelopeId`, the incoming leg credits `toAccountId`/
 * `toSubEnvelopeId`; each leg's `counterTransactionId` points at the other.
 * Neither leg has a category (a transfer has no category). Returns
 * `[outgoingLeg, incomingLeg]` as a readonly tuple.
 */
export function createTransferPair(input: {
  outgoingId: TransactionId;
  incomingId: TransactionId;
  date: LedgerDate;
  description: string;
  fromAccountId: AccountId;
  fromSubEnvelopeId: SubEnvelopeId;
  toAccountId: AccountId;
  toSubEnvelopeId: SubEnvelopeId;
  amount: Cents;
}): readonly [Transaction, Transaction] {
  assertPositiveTransferAmount(input.amount);
  assertDistinctLegIds(input.outgoingId, input.incomingId);

  const outgoingLeg = createTransaction({
    id: input.outgoingId,
    date: input.date,
    description: input.description,
    categoryId: null,
    accountId: input.fromAccountId,
    subEnvelopeId: input.fromSubEnvelopeId,
    counterTransactionId: input.incomingId,
    amount: negateCents(input.amount),
  });

  const incomingLeg = createTransaction({
    id: input.incomingId,
    date: input.date,
    description: input.description,
    categoryId: null,
    accountId: input.toAccountId,
    subEnvelopeId: input.toSubEnvelopeId,
    counterTransactionId: input.outgoingId,
    amount: input.amount,
  });

  return [outgoingLeg, incomingLeg] as const;
}

/** True iff `transaction` is one leg of a paired transfer. */
export function isPairedTransaction(transaction: Transaction): boolean {
  return transaction.counterTransactionId !== null;
}

/**
 * Looks up `transaction`'s paired counterpart within `transactions`. Returns
 * `null` if `transaction.counterTransactionId` is `null` or no match is
 * found in the list.
 */
export function findCounterTransaction(
  transactions: readonly Transaction[],
  transaction: Transaction,
): Transaction | null {
  if (transaction.counterTransactionId === null) {
    return null;
  }
  const counterId = transaction.counterTransactionId;
  const match = transactions.find((candidate) => candidate.id === counterId);
  return match ?? null;
}
