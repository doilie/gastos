// Real, Postgres-backed implementation of the Ledger Core store
// (Transaction) — mirrors apps/server/src/reference-store.ts's exact
// shape: `createLedgerStore(db)` returns the same get*/add* surface
// apps/server/src/store.ts previously exposed as synchronous in-memory
// functions, but async and backed by real Drizzle queries against `db`.
// Rows are mapped to/from the branded domain types directly (via
// `transactionIdFromString`/`centsFromInt`), not through a `createX`
// factory — a DB row is already trusted/validated data.

import { transactions, type Db } from "@gastos/db";
import {
  categoryIdFromString,
  centsFromInt,
  accountIdFromString,
  subEnvelopeIdFromString,
  transactionIdFromString,
  ledgerDateFromString,
  type Transaction,
  type TransactionId,
} from "@gastos/shared";
import { eq } from "drizzle-orm";

/** The async Ledger Core store surface, backed by a real Postgres `Db`. */
export interface LedgerStore {
  getTransactions(): Promise<readonly Transaction[]>;
  addTransaction(transaction: Transaction): Promise<void>;
  replaceTransaction(transaction: Transaction): Promise<void>;
  deleteTransaction(id: TransactionId): Promise<void>;
}

function toTransaction(row: typeof transactions.$inferSelect): Transaction {
  return {
    id: transactionIdFromString(row.id),
    date: ledgerDateFromString(row.date),
    description: row.description,
    categoryId: row.categoryId === null ? null : categoryIdFromString(row.categoryId),
    accountId: accountIdFromString(row.accountId),
    subEnvelopeId: subEnvelopeIdFromString(row.subEnvelopeId),
    counterTransactionId:
      row.counterTransactionId === null ? null : transactionIdFromString(row.counterTransactionId),
    amount: centsFromInt(row.amount),
  };
}

async function getTransactionsImpl(db: Db): Promise<readonly Transaction[]> {
  const rows = await db.select().from(transactions);
  return rows.map(toTransaction);
}

async function addTransactionImpl(db: Db, transaction: Transaction): Promise<void> {
  await db.insert(transactions).values({
    id: transaction.id,
    date: transaction.date,
    description: transaction.description,
    categoryId: transaction.categoryId,
    accountId: transaction.accountId,
    subEnvelopeId: transaction.subEnvelopeId,
    counterTransactionId: transaction.counterTransactionId,
    amount: transaction.amount,
  });
}

async function replaceTransactionImpl(db: Db, transaction: Transaction): Promise<void> {
  await db
    .update(transactions)
    .set({
      date: transaction.date,
      description: transaction.description,
      categoryId: transaction.categoryId,
      accountId: transaction.accountId,
      subEnvelopeId: transaction.subEnvelopeId,
      counterTransactionId: transaction.counterTransactionId,
      amount: transaction.amount,
    })
    .where(eq(transactions.id, transaction.id));
}

async function deleteTransactionImpl(db: Db, id: TransactionId): Promise<void> {
  await db.delete(transactions).where(eq(transactions.id, id));
}

/**
 * Builds a `LedgerStore` backed by `db` — a real Postgres connection for
 * production use (see `apps/server/src/db.ts`), or any other `Db` instance
 * for anyone else who needs one.
 */
export function createLedgerStore(db: Db): LedgerStore {
  return {
    getTransactions: () => getTransactionsImpl(db),
    addTransaction: (transaction) => addTransactionImpl(db, transaction),
    replaceTransaction: (transaction) => replaceTransactionImpl(db, transaction),
    deleteTransaction: (id) => deleteTransactionImpl(db, id),
  };
}
