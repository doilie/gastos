// Drizzle schema for the Reference layer (packages/shared/src/reference/**).
//
// Column type conventions (repo-wide, see CLAUDE.md / the task that created
// this file): every branded id type is `text` (this app's ids are seeded
// slugs or `randomUUID()` strings, not native Postgres `uuid`); `Cents` is
// `integer` (already integer centavos); `LedgerDate`/`YYYY-MM-DD` strings are
// `date`; `.notNull()` everywhere the TypeScript type isn't nullable/
// optional; `.references()` wherever a column points at another table's id.
//
// No `currencies` table: `CurrencyCode` is a plain 3-letter code stored
// inline (`text`), matching how `packages/shared` models it today (no
// `Currency` CRUD/entity exists).

import { boolean, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

/** Mirrors `Account` (packages/shared/src/reference/account.ts). */
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull(),
  isArchived: boolean("is_archived").notNull(),
});

/** Mirrors `Category` (packages/shared/src/reference/category.ts). */
export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isIncome: boolean("is_income").notNull(),
});

/** Mirrors `EnvelopeGroup` (packages/shared/src/reference/envelope.ts). */
export const envelopeGroups = pgTable("envelope_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

/**
 * Mirrors `SubEnvelope` (packages/shared/src/reference/envelope.ts).
 * `groupId` is nullable: `null` means "does not belong to a user group",
 * used exclusively by the reserved Spendable envelope singleton.
 */
export const subEnvelopes = pgTable("sub_envelopes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  groupId: text("group_id").references(() => envelopeGroups.id),
  isArchived: boolean("is_archived").notNull(),
});

/**
 * Join table for `SubEnvelope.accountIds` (a `SubEnvelope` is allocated over
 * one or more accounts per HLD decision A1). Modeled as a relation table
 * rather than a native Postgres array — unlike
 * `PaydaySchedule.paydayDaysOfMonth` (a small fixed-shape list of plain
 * integers, no foreign keys involved), each entry here is itself a foreign
 * key into `accounts`, which a native array column cannot enforce.
 */
export const subEnvelopeAccounts = pgTable(
  "sub_envelope_accounts",
  {
    subEnvelopeId: text("sub_envelope_id")
      .notNull()
      .references(() => subEnvelopes.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
  },
  (table) => [primaryKey({ columns: [table.subEnvelopeId, table.accountId] })],
);

/** Mirrors `CreditCard` (packages/shared/src/reference/credit-card.ts). */
export const creditCards = pgTable("credit_cards", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull(),
  /** Day-of-month (1-31) the statement cuts off. */
  cutoffDay: integer("cutoff_day").notNull(),
  isArchived: boolean("is_archived").notNull(),
});

/**
 * Mirrors `PaydaySchedule` (packages/shared/src/reference/payday-schedule.ts).
 * `paydayDaysOfMonth` uses Postgres's native integer array support — a small
 * fixed-shape config value (plain day-of-month integers, no foreign keys),
 * not a relation, so a join table would be overkill here.
 */
export const paydaySchedules = pgTable("payday_schedules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  paydayDaysOfMonth: integer("payday_days_of_month").array().notNull(),
  isPrimary: boolean("is_primary").notNull(),
});
