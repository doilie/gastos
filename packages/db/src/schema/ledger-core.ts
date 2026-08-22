// Drizzle schema for the Ledger Core layer
// (packages/shared/src/ledger-core/transaction.ts) — the single write
// surface of the ledger. See reference.ts for the column-type conventions
// this file follows.

import { type AnyPgColumn, date, integer, pgTable, text } from "drizzle-orm/pg-core";

import { accounts, categories, subEnvelopes } from "./reference";

/**
 * Mirrors `Transaction`. `amount` is signed integer centavos (positive =
 * credit/inflow, negative = debit/outflow — the load-bearing sign
 * convention documented on `Transaction.amount`). `counterTransactionId` is
 * a nullable self-reference used to pair transfer legs (HLD §2.2, "paired
 * postings"); `categoryId` is nullable (`null` means no category applies,
 * e.g. a transfer).
 */
export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  date: date("date").notNull(),
  description: text("description").notNull(),
  categoryId: text("category_id").references(() => categories.id),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  subEnvelopeId: text("sub_envelope_id")
    .notNull()
    .references(() => subEnvelopes.id),
  counterTransactionId: text("counter_transaction_id").references(
    (): AnyPgColumn => transactions.id,
  ),
  amount: integer("amount").notNull(),
});
