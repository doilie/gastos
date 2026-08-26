// Wires a real Postgres connection (via @gastos/db) into apps/server — the
// "real database" thread (packages/db, Increment 43) actually consumed by
// the server. Loads DATABASE_URL from the repo-root .env (falling back to
// the same default packages/db/drizzle.config.ts uses), exports the
// production `db` singleton and the Reference/Ledger-Core/Domain-layer
// stores built on top of it (`referenceStore`/`ledgerStore`/`domainStore`),
// a migration runner, and the two idempotent seed functions covering every
// table this app has always seeded (`seedReferenceData` for
// Account/Category/EnvelopeGroup/SubEnvelope, `seedRemainingFixtureData` for
// CreditCard/PaydaySchedule/Transaction/CardPurchase/BudgetLine).
//
// The `.env` path is resolved relative to this file (via
// fileURLToPath(import.meta.url)) rather than relying on dotenv's default
// cwd-relative lookup, since `pnpm --filter` may run with cwd set to this
// package's directory, not the repo root.

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  accounts,
  budgetLines,
  cardPurchases,
  categories,
  creditCards,
  createDbClient,
  envelopeGroups,
  paydaySchedules,
  subEnvelopeAccounts,
  subEnvelopes,
  transactions,
  type Db,
} from "@gastos/db";
import {
  accountIdFromString,
  type AccountId,
  budgetLineIdFromString,
  cardPurchaseIdFromString,
  categoryIdFromString,
  type CategoryId,
  centsFromInt,
  createCreditCardBudgetEnvelope,
  createSpendableEnvelope,
  creditCardIdFromString,
  type CreditCardId,
  currencyCodeFromString,
  envelopeGroupIdFromString,
  type EnvelopeGroupId,
  paydayScheduleIdFromString,
  SPENDABLE_ENVELOPE_ID,
  subEnvelopeIdFromString,
  type SubEnvelopeId,
  transactionIdFromString,
} from "@gastos/shared";
import dotenv from "dotenv";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDomainStore, type DomainStore } from "./domain-store";
import { createLedgerStore, type LedgerStore } from "./ledger-store";
import { createReferenceStore, type ReferenceStore } from "./reference-store";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(THIS_DIR, "../../..");

dotenv.config({ path: path.join(REPO_ROOT, ".env") });

const DATABASE_URL =
  process.env["DATABASE_URL"] ?? "postgres://gastos:gastos@localhost:5432/gastos_dev";

/** Production Postgres client, bound to @gastos/db's full schema. */
export const db: Db = createDbClient(DATABASE_URL);

/** The Reference-layer store, backed by the production `db` connection. */
export const referenceStore: ReferenceStore = createReferenceStore(db);

/** The Ledger Core store (Transaction), backed by the production `db` connection. */
export const ledgerStore: LedgerStore = createLedgerStore(db);

/** The remaining Domain-layer store (CreditCard/PaydaySchedule/CardPurchase/BudgetLine), backed by the production `db` connection. */
export const domainStore: DomainStore = createDomainStore(db);

const MIGRATIONS_FOLDER = path.join(REPO_ROOT, "packages/db/drizzle");

/** Applies every not-yet-applied migration in packages/db/drizzle to `targetDb`. */
export async function runMigrations(targetDb: Db): Promise<void> {
  await migrate(targetDb, { migrationsFolder: MIGRATIONS_FOLDER });
}

// Fixed ids for the fixture data this app has always seeded. Not exported —
// now that apps/server/src/store.ts is a pure re-export barrel over this
// file's stores (Increment 53), nothing outside this file (all seeding now
// lives here too, in seedReferenceData/seedRemainingFixtureData) needs to
// reference any of these.
const CHECKING_ACCOUNT_ID: AccountId = accountIdFromString("account-checking");
const SAVINGS_ACCOUNT_ID: AccountId = accountIdFromString("account-savings");
const INCOME_CATEGORY_ID: CategoryId = categoryIdFromString("category-income");
const GROCERIES_CATEGORY_ID: CategoryId = categoryIdFromString("category-groceries");
const TRANSPORT_CATEGORY_ID: CategoryId = categoryIdFromString("category-transport");
const EVERYDAY_GROUP_ID: EnvelopeGroupId = envelopeGroupIdFromString("envelope-group-everyday");
const GROCERIES_FUND_ENVELOPE_ID: SubEnvelopeId = subEnvelopeIdFromString(
  "sub-envelope-groceries-fund",
);
const VISA_CARD_ID: CreditCardId = creditCardIdFromString("credit-card-visa");

const PHP = currencyCodeFromString("PHP");
const spendableEnvelope = createSpendableEnvelope([CHECKING_ACCOUNT_ID]);
const creditCardBudgetEnvelope = createCreditCardBudgetEnvelope([CHECKING_ACCOUNT_ID]);

async function seedAccounts(targetDb: Db): Promise<void> {
  await targetDb
    .insert(accounts)
    .values([
      { id: CHECKING_ACCOUNT_ID, name: "Checking", currency: PHP, isArchived: false },
      { id: SAVINGS_ACCOUNT_ID, name: "Savings", currency: PHP, isArchived: false },
    ])
    .onConflictDoNothing();
}

async function seedCategories(targetDb: Db): Promise<void> {
  await targetDb
    .insert(categories)
    .values([
      { id: INCOME_CATEGORY_ID, name: "Income", isIncome: true },
      { id: GROCERIES_CATEGORY_ID, name: "Groceries", isIncome: false },
      { id: TRANSPORT_CATEGORY_ID, name: "Transport", isIncome: false },
    ])
    .onConflictDoNothing();
}

async function seedEnvelopeGroups(targetDb: Db): Promise<void> {
  await targetDb
    .insert(envelopeGroups)
    .values([{ id: EVERYDAY_GROUP_ID, name: "Everyday" }])
    .onConflictDoNothing();
}

async function seedSubEnvelopes(targetDb: Db): Promise<void> {
  await targetDb
    .insert(subEnvelopes)
    .values([
      {
        id: GROCERIES_FUND_ENVELOPE_ID,
        name: "Groceries Fund",
        groupId: EVERYDAY_GROUP_ID,
        isArchived: false,
      },
      {
        id: spendableEnvelope.id,
        name: spendableEnvelope.name,
        groupId: null,
        isArchived: false,
      },
      {
        id: creditCardBudgetEnvelope.id,
        name: creditCardBudgetEnvelope.name,
        groupId: null,
        isArchived: false,
      },
    ])
    .onConflictDoNothing();
}

async function seedSubEnvelopeAccounts(targetDb: Db): Promise<void> {
  await targetDb
    .insert(subEnvelopeAccounts)
    .values([
      { subEnvelopeId: GROCERIES_FUND_ENVELOPE_ID, accountId: SAVINGS_ACCOUNT_ID },
      { subEnvelopeId: spendableEnvelope.id, accountId: CHECKING_ACCOUNT_ID },
      { subEnvelopeId: creditCardBudgetEnvelope.id, accountId: CHECKING_ACCOUNT_ID },
    ])
    .onConflictDoNothing();
}

/**
 * Idempotently inserts the fixture Reference-layer rows this app has always
 * seeded (2 accounts, 3 categories, 1 envelope group, the Groceries Fund
 * sub-envelope, and the reserved Spendable and Credit Card Budget
 * sub-envelopes, plus each sub-envelope's linked-account rows) — safe to call on every server start,
 * via `.onConflictDoNothing()` on each insert. Tables are seeded in FK
 * order: accounts/categories/envelope groups before the sub-envelopes that
 * reference them, sub-envelopes before the join rows that reference them.
 */
export async function seedReferenceData(targetDb: Db): Promise<void> {
  await seedAccounts(targetDb);
  await seedCategories(targetDb);
  await seedEnvelopeGroups(targetDb);
  await seedSubEnvelopes(targetDb);
  await seedSubEnvelopeAccounts(targetDb);
}

async function seedCreditCards(targetDb: Db): Promise<void> {
  await targetDb
    .insert(creditCards)
    .values([
      { id: VISA_CARD_ID, name: "Visa", currency: PHP, cutoffDay: 17, isArchived: false },
    ])
    .onConflictDoNothing();
}

async function seedPaydaySchedules(targetDb: Db): Promise<void> {
  await targetDb
    .insert(paydaySchedules)
    .values([
      {
        id: paydayScheduleIdFromString("payday-schedule-default"),
        name: "Semi-monthly",
        paydayDaysOfMonth: [15, 31],
        isPrimary: true,
      },
    ])
    .onConflictDoNothing();
}

async function seedTransactions(targetDb: Db): Promise<void> {
  await targetDb
    .insert(transactions)
    .values([
      {
        id: transactionIdFromString("txn-salary"),
        date: "2026-08-01",
        description: "Salary",
        categoryId: INCOME_CATEGORY_ID,
        accountId: CHECKING_ACCOUNT_ID,
        subEnvelopeId: SPENDABLE_ENVELOPE_ID,
        amount: centsFromInt(5000000),
      },
      {
        id: transactionIdFromString("txn-groceries-1"),
        date: "2026-08-03",
        description: "Weekly groceries",
        categoryId: GROCERIES_CATEGORY_ID,
        accountId: CHECKING_ACCOUNT_ID,
        subEnvelopeId: SPENDABLE_ENVELOPE_ID,
        amount: centsFromInt(-120050),
      },
      {
        id: transactionIdFromString("txn-transport-1"),
        date: "2026-08-05",
        description: "Jeepney fare",
        categoryId: TRANSPORT_CATEGORY_ID,
        accountId: CHECKING_ACCOUNT_ID,
        subEnvelopeId: SPENDABLE_ENVELOPE_ID,
        amount: centsFromInt(-5000),
      },
      {
        id: transactionIdFromString("txn-groceries-2"),
        date: "2026-08-08",
        description: "Market run",
        categoryId: GROCERIES_CATEGORY_ID,
        accountId: CHECKING_ACCOUNT_ID,
        subEnvelopeId: SPENDABLE_ENVELOPE_ID,
        amount: centsFromInt(-84000),
      },
      {
        id: transactionIdFromString("txn-groceries-fund-allocation"),
        date: "2026-08-10",
        description: "Allocate to Groceries Fund",
        categoryId: null,
        accountId: SAVINGS_ACCOUNT_ID,
        subEnvelopeId: GROCERIES_FUND_ENVELOPE_ID,
        amount: centsFromInt(300000),
      },
    ])
    .onConflictDoNothing();
}

async function seedCardPurchases(targetDb: Db): Promise<void> {
  await targetDb
    .insert(cardPurchases)
    .values([
      {
        id: cardPurchaseIdFromString("card-purchase-transport-1"),
        creditCardId: VISA_CARD_ID,
        date: "2026-07-20",
        description: "Grab ride",
        categoryId: TRANSPORT_CATEGORY_ID,
        amount: centsFromInt(45000),
        fundingSourceKind: "account",
        fundingSourceAccountId: CHECKING_ACCOUNT_ID,
        fundingSourceEnvelopeId: null,
      },
      {
        id: cardPurchaseIdFromString("card-purchase-groceries-1"),
        creditCardId: VISA_CARD_ID,
        date: "2026-08-02",
        description: "Supermarket run",
        categoryId: GROCERIES_CATEGORY_ID,
        amount: centsFromInt(210000),
        fundingSourceKind: "envelope",
        fundingSourceAccountId: null,
        fundingSourceEnvelopeId: GROCERIES_FUND_ENVELOPE_ID,
      },
      {
        id: cardPurchaseIdFromString("card-purchase-groceries-2"),
        creditCardId: VISA_CARD_ID,
        date: "2026-08-12",
        description: "Convenience store snacks",
        categoryId: GROCERIES_CATEGORY_ID,
        amount: centsFromInt(15000),
        fundingSourceKind: "none",
        fundingSourceAccountId: null,
        fundingSourceEnvelopeId: null,
      },
    ])
    .onConflictDoNothing();
}

async function seedBudgetLines(targetDb: Db): Promise<void> {
  const augustPaydayDate = "2026-08-15";

  await targetDb
    .insert(budgetLines)
    .values([
      {
        id: budgetLineIdFromString("budget-line-groceries-fund-august-15"),
        budgetPeriodYear: 2026,
        budgetPeriodMonth: 8,
        paydayDate: augustPaydayDate,
        subEnvelopeId: GROCERIES_FUND_ENVELOPE_ID,
        amount: centsFromInt(500000),
        description: "Payday allocation — Groceries Fund",
        isApplied: false,
      },
      {
        id: budgetLineIdFromString("budget-line-spendable-august-15"),
        budgetPeriodYear: 2026,
        budgetPeriodMonth: 8,
        paydayDate: augustPaydayDate,
        subEnvelopeId: SPENDABLE_ENVELOPE_ID,
        amount: centsFromInt(2000000),
        description: "Payday allocation — Spendable",
        isApplied: false,
      },
    ])
    .onConflictDoNothing();
}

/**
 * Idempotently inserts the remaining fixture data (Ledger Core/Domain-layer
 * rows this app has always seeded — 1 credit card, 1 payday schedule, 5
 * transactions, 3 card purchases, 2 budget lines), mirroring
 * `seedReferenceData`'s `.onConflictDoNothing()` idempotency. Must run after
 * `seedReferenceData` has already populated the accounts/categories/
 * sub-envelopes these rows' foreign keys point at. Dates are plain
 * `YYYY-MM-DD` string literals rather than going through
 * `ledgerDateFromString` — Drizzle's `date` columns accept the string
 * directly, and this is trusted fixture data, not user input. Tables are
 * seeded in FK order: credit cards/payday schedules first (no dependency on
 * each other), transactions next (reference accounts/categories/
 * sub-envelopes), then card purchases (reference the credit card plus
 * accounts/sub-envelopes via `FundingSource`), then budget lines (reference
 * sub-envelopes).
 */
export async function seedRemainingFixtureData(targetDb: Db): Promise<void> {
  await seedCreditCards(targetDb);
  await seedPaydaySchedules(targetDb);
  await seedTransactions(targetDb);
  await seedCardPurchases(targetDb);
  await seedBudgetLines(targetDb);
}
