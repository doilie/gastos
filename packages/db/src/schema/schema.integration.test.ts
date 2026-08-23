// Docker-gated integration tests for @gastos/db's Drizzle schema
// (packages/db/src/schema/**) against a real ephemeral Postgres, per
// gastos-tester's Docker-constraint protocol.
//
// Docker is installed and running in this environment, so this suite runs
// for real against an ephemeral testcontainers-managed `postgres:16-alpine`
// container (started fresh per run, migrated, then torn down in `afterAll`).
//
// Covers: round-tripping a minimal valid row through all 10 tables (in FK
// order, applying both migration files in packages/db/drizzle), the
// sub_envelopes -> envelope_groups FK actually rejecting a dangling
// groupId, the transactions table's self-referencing counterTransactionId
// FK, and card_purchases.fundingSourceKind's NOT NULL constraint (the
// specific fix applied by migration 0001, worth its own assertion).

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbClient, type Db } from "../client";
import {
  accounts,
  budgetLines,
  cardPurchases,
  categories,
  creditCards,
  envelopeGroups,
  paydaySchedules,
  subEnvelopeAccounts,
  subEnvelopes,
  transactions,
} from "./index";

const MIGRATIONS_FOLDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

async function insertAccount(db: Db): Promise<string> {
  const id = randomUUID();
  const row = { id, name: "Checking", currency: "USD", isArchived: false };
  await db.insert(accounts).values(row);
  const [found] = await db.select().from(accounts).where(eq(accounts.id, id));
  expect(found).toEqual(row);
  return id;
}

async function insertCategory(db: Db): Promise<string> {
  const id = randomUUID();
  const row = { id, name: "Groceries", isIncome: false };
  await db.insert(categories).values(row);
  const [found] = await db.select().from(categories).where(eq(categories.id, id));
  expect(found).toEqual(row);
  return id;
}

async function insertEnvelopeGroup(db: Db): Promise<string> {
  const id = randomUUID();
  const row = { id, name: "Bills" };
  await db.insert(envelopeGroups).values(row);
  const [found] = await db.select().from(envelopeGroups).where(eq(envelopeGroups.id, id));
  expect(found).toEqual(row);
  return id;
}

async function insertSubEnvelope(db: Db, groupId: string | null): Promise<string> {
  const id = randomUUID();
  const row = { id, name: "Rent", groupId, isArchived: false };
  await db.insert(subEnvelopes).values(row);
  const [found] = await db.select().from(subEnvelopes).where(eq(subEnvelopes.id, id));
  expect(found).toEqual(row);
  return id;
}

async function insertSubEnvelopeAccount(
  db: Db,
  subEnvelopeId: string,
  accountId: string,
): Promise<void> {
  const row = { subEnvelopeId, accountId };
  await db.insert(subEnvelopeAccounts).values(row);
  const [found] = await db
    .select()
    .from(subEnvelopeAccounts)
    .where(eq(subEnvelopeAccounts.subEnvelopeId, subEnvelopeId));
  expect(found).toEqual(row);
}

async function insertCreditCard(db: Db): Promise<string> {
  const id = randomUUID();
  const row = { id, name: "Visa", currency: "USD", cutoffDay: 15, isArchived: false };
  await db.insert(creditCards).values(row);
  const [found] = await db.select().from(creditCards).where(eq(creditCards.id, id));
  expect(found).toEqual(row);
  return id;
}

async function insertPaydaySchedule(db: Db): Promise<string> {
  const id = randomUUID();
  const row = { id, name: "Biweekly", paydayDaysOfMonth: [1, 15] };
  await db.insert(paydaySchedules).values(row);
  const [found] = await db.select().from(paydaySchedules).where(eq(paydaySchedules.id, id));
  expect(found).toEqual(row);
  return id;
}

async function insertTransaction(
  db: Db,
  params: { accountId: string; subEnvelopeId: string; counterTransactionId?: string | null },
): Promise<string> {
  const id = randomUUID();
  const row = {
    id,
    date: "2026-08-01",
    description: "Test transaction",
    categoryId: null,
    accountId: params.accountId,
    subEnvelopeId: params.subEnvelopeId,
    counterTransactionId: params.counterTransactionId ?? null,
    amount: -500,
  };
  await db.insert(transactions).values(row);
  const [found] = await db.select().from(transactions).where(eq(transactions.id, id));
  expect(found).toEqual(row);
  return id;
}

async function insertBudgetLine(db: Db, subEnvelopeId: string): Promise<string> {
  const id = randomUUID();
  const row = {
    id,
    budgetPeriodYear: 2026,
    budgetPeriodMonth: 8,
    paydayDate: "2026-08-01",
    subEnvelopeId,
    amount: 2000,
    description: "Test allocation",
  };
  await db.insert(budgetLines).values(row);
  const [found] = await db.select().from(budgetLines).where(eq(budgetLines.id, id));
  expect(found).toEqual(row);
  return id;
}

async function insertCardPurchase(db: Db, creditCardId: string): Promise<string> {
  const id = randomUUID();
  const row = {
    id,
    creditCardId,
    date: "2026-08-01",
    description: "Test purchase",
    categoryId: null,
    amount: 1500,
    fundingSourceKind: "none",
    fundingSourceAccountId: null,
    fundingSourceEnvelopeId: null,
  };
  await db.insert(cardPurchases).values(row);
  const [found] = await db.select().from(cardPurchases).where(eq(cardPurchases.id, id));
  expect(found).toEqual(row);
  return id;
}

/** beforeAll setup: start the container, apply both migrations, connect. */
async function startMigratedContainer(): Promise<{
  container: StartedPostgreSqlContainer;
  db: Db;
}> {
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const connectionUri = container.getConnectionUri();

  const migrationClient = postgres(connectionUri, { max: 1 });
  await migrate(drizzle(migrationClient), { migrationsFolder: MIGRATIONS_FOLDER });
  await migrationClient.end();

  return { container, db: createDbClient(connectionUri) };
}

async function testRoundTripsAllTables(db: Db): Promise<void> {
  const accountId = await insertAccount(db);
  await insertCategory(db);
  const groupId = await insertEnvelopeGroup(db);
  const subEnvelopeId = await insertSubEnvelope(db, groupId);
  await insertSubEnvelopeAccount(db, subEnvelopeId, accountId);
  const creditCardId = await insertCreditCard(db);
  await insertPaydaySchedule(db);

  const firstLegId = await insertTransaction(db, { accountId, subEnvelopeId });
  await insertTransaction(db, { accountId, subEnvelopeId, counterTransactionId: firstLegId });

  await insertBudgetLine(db, subEnvelopeId);
  await insertCardPurchase(db, creditCardId);
}

async function testRejectsOrphanGroupId(db: Db): Promise<void> {
  await expect(
    db.insert(subEnvelopes).values({
      id: randomUUID(),
      name: "Orphan",
      groupId: randomUUID(),
      isArchived: false,
    }),
  ).rejects.toThrow();
}

async function testSelfReferencingCounterTransactionId(db: Db): Promise<void> {
  const accountId = await insertAccount(db);
  const subEnvelopeId = await insertSubEnvelope(db, null);

  const leg2Id = await insertTransaction(db, { accountId, subEnvelopeId });
  const leg1Id = await insertTransaction(db, {
    accountId,
    subEnvelopeId,
    counterTransactionId: leg2Id,
  });

  await db.update(transactions).set({ counterTransactionId: leg1Id }).where(eq(transactions.id, leg2Id));
  const [updatedLeg2] = await db.select().from(transactions).where(eq(transactions.id, leg2Id));

  expect(updatedLeg2?.counterTransactionId).toBe(leg1Id);
}

async function testRejectsNullFundingSourceKind(db: Db): Promise<void> {
  const creditCardId = await insertCreditCard(db);

  // fundingSourceKind is deliberately null here to assert the DB's own NOT
  // NULL constraint rejects it — the column is typed as required
  // (non-nullable) in Drizzle's inferred insert type, so this cast is
  // needed to construct an otherwise-invalid row on purpose.
  const invalidRow = {
    id: randomUUID(),
    creditCardId,
    date: "2026-08-01",
    description: "Missing funding source kind",
    categoryId: null,
    amount: 1000,
    fundingSourceKind: null,
    fundingSourceAccountId: null,
    fundingSourceEnvelopeId: null,
  } as unknown as typeof cardPurchases.$inferInsert;

  await expect(db.insert(cardPurchases).values(invalidRow)).rejects.toThrow();
}

describe("@gastos/db schema (testcontainers Postgres)", () => {
  let container: StartedPostgreSqlContainer;
  let db: Db;

  beforeAll(async () => {
    ({ container, db } = await startMigratedContainer());
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("round-trips a minimal valid row through every table, in FK order", () => testRoundTripsAllTables(db));

  it("rejects a sub_envelopes row whose groupId does not reference a real envelope_groups row", () =>
    testRejectsOrphanGroupId(db));

  it("supports transactions.counterTransactionId as a self-referencing FK linking two legs", () =>
    testSelfReferencingCounterTransactionId(db));

  it("rejects a card_purchases row with fundingSourceKind explicitly null (NOT NULL, migration 0001)", () =>
    testRejectsNullFundingSourceKind(db));
});
