// Drizzle schema for the Domain layer (packages/shared/src/domain/**). See
// reference.ts for the column-type conventions this file follows.

import { date, integer, pgTable, text } from "drizzle-orm/pg-core";

import { accounts, categories, creditCards, subEnvelopes } from "./reference";

/**
 * Mirrors `CardPurchase` (packages/shared/src/domain/card-purchase.ts).
 * `amount` is always a positive magnitude (how much is owed), distinct from
 * `transactions.amount`'s signed convention — a `CardPurchase` is not itself
 * a ledger posting.
 *
 * `FundingSource` (a discriminated union with no native Postgres
 * equivalent) is flattened into three columns: `fundingSourceKind` plus one
 * nullable id column per variant that carries data. Only one of
 * `fundingSourceAccountId`/`fundingSourceEnvelopeId` is ever populated for a
 * given row — which one (if either) is determined by `fundingSourceKind`.
 * `kind: "none"` (the default/unassigned `FundingSource`, `UNFUNDED_SOURCE`)
 * maps to `fundingSourceKind: "none"` with both id columns null.
 */
export const cardPurchases = pgTable("card_purchases", {
  id: text("id").primaryKey(),
  creditCardId: text("credit_card_id")
    .notNull()
    .references(() => creditCards.id),
  date: date("date").notNull(),
  description: text("description").notNull(),
  categoryId: text("category_id").references(() => categories.id),
  amount: integer("amount").notNull(),
  /** One of `"account"` / `"envelope"` / `"none"`, mirroring `FundingSource["kind"]`. */
  fundingSourceKind: text("funding_source_kind").notNull(),
  fundingSourceAccountId: text("funding_source_account_id").references(() => accounts.id),
  fundingSourceEnvelopeId: text("funding_source_envelope_id").references(() => subEnvelopes.id),
});

/**
 * Mirrors `BudgetLine` (packages/shared/src/domain/budget-line.ts).
 * `amount` is always a positive magnitude (how much is allocated), distinct
 * from `transactions.amount`'s signed convention — a `BudgetLine` is not
 * itself a ledger posting. `budgetPeriod: {year, month}` is flattened into
 * two integer columns since a `BudgetPeriod` is a pure derived value with no
 * id of its own (packages/shared/src/domain/budget-period.ts), not a
 * separate referenceable entity.
 */
export const budgetLines = pgTable("budget_lines", {
  id: text("id").primaryKey(),
  budgetPeriodYear: integer("budget_period_year").notNull(),
  budgetPeriodMonth: integer("budget_period_month").notNull(),
  paydayDate: date("payday_date").notNull(),
  subEnvelopeId: text("sub_envelope_id")
    .notNull()
    .references(() => subEnvelopes.id),
  amount: integer("amount").notNull(),
  description: text("description").notNull(),
});
