// Wires a real Postgres connection (via @gastos/db) into apps/server — the
// first piece of the "real database" thread (packages/db, Increment 43)
// actually consumed by the server. Loads DATABASE_URL from the repo-root
// .env (falling back to the same default packages/db/drizzle.config.ts
// uses), exports the production `db` singleton and the Reference-layer
// store built on top of it, plus a migration runner and an idempotent seed
// for apps/server/src/store.ts's fixture data.
//
// The `.env` path is resolved relative to this file (via
// fileURLToPath(import.meta.url)) rather than relying on dotenv's default
// cwd-relative lookup, since `pnpm --filter` may run with cwd set to this
// package's directory, not the repo root.

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  accounts,
  categories,
  createDbClient,
  envelopeGroups,
  subEnvelopeAccounts,
  subEnvelopes,
  type Db,
} from "@gastos/db";
import {
  accountIdFromString,
  type AccountId,
  categoryIdFromString,
  type CategoryId,
  createSpendableEnvelope,
  currencyCodeFromString,
  envelopeGroupIdFromString,
  type EnvelopeGroupId,
  subEnvelopeIdFromString,
  type SubEnvelopeId,
} from "@gastos/shared";
import dotenv from "dotenv";
import { migrate } from "drizzle-orm/postgres-js/migrator";

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

const MIGRATIONS_FOLDER = path.join(REPO_ROOT, "packages/db/drizzle");

/** Applies every not-yet-applied migration in packages/db/drizzle to `targetDb`. */
export async function runMigrations(targetDb: Db): Promise<void> {
  await migrate(targetDb, { migrationsFolder: MIGRATIONS_FOLDER });
}

// Fixed ids for the fixture Reference-layer data this app has always
// seeded. Exported so apps/server/src/store.ts's non-reference seed data
// (transactions, card purchases, budget lines — none of which are
// DB-backed yet) can keep pointing at the same, now-DB-backed rows.
export const CHECKING_ACCOUNT_ID: AccountId = accountIdFromString("account-checking");
export const SAVINGS_ACCOUNT_ID: AccountId = accountIdFromString("account-savings");
export const INCOME_CATEGORY_ID: CategoryId = categoryIdFromString("category-income");
export const GROCERIES_CATEGORY_ID: CategoryId = categoryIdFromString("category-groceries");
export const TRANSPORT_CATEGORY_ID: CategoryId = categoryIdFromString("category-transport");
// Not exported: unlike the other fixed ids above, nothing outside this file
// needs to reference the envelope group's id.
const EVERYDAY_GROUP_ID: EnvelopeGroupId = envelopeGroupIdFromString("envelope-group-everyday");
export const GROCERIES_FUND_ENVELOPE_ID: SubEnvelopeId = subEnvelopeIdFromString(
  "sub-envelope-groceries-fund",
);

const PHP = currencyCodeFromString("PHP");
const spendableEnvelope = createSpendableEnvelope([CHECKING_ACCOUNT_ID]);

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
    ])
    .onConflictDoNothing();
}

async function seedSubEnvelopeAccounts(targetDb: Db): Promise<void> {
  await targetDb
    .insert(subEnvelopeAccounts)
    .values([
      { subEnvelopeId: GROCERIES_FUND_ENVELOPE_ID, accountId: SAVINGS_ACCOUNT_ID },
      { subEnvelopeId: spendableEnvelope.id, accountId: CHECKING_ACCOUNT_ID },
    ])
    .onConflictDoNothing();
}

/**
 * Idempotently inserts the fixture Reference-layer rows this app has always
 * seeded (2 accounts, 3 categories, 1 envelope group, the Groceries Fund
 * sub-envelope, and the reserved Spendable sub-envelope, plus each
 * sub-envelope's linked-account rows) — safe to call on every server start,
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
