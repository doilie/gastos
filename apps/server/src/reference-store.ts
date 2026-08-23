// Real, Postgres-backed implementation of the Reference-layer store
// (Account/Category/EnvelopeGroup/SubEnvelope) — the first slice of the
// "real database" thread (packages/db, Increment 43) actually wired into
// apps/server. `createReferenceStore(db)` returns the same
// get*/add*/replace*/delete* surface `apps/server/src/store.ts` exposed as
// synchronous in-memory functions, but async and backed by real Drizzle
// queries against `db`. Rows are mapped to/from the branded domain types
// directly (via each type's `xFromString` constructor), not through a
// `createX` factory — a DB row is already trusted/validated data, so
// re-running `createX`'s validation on every read would be redundant.

import {
  accounts,
  categories,
  envelopeGroups,
  subEnvelopeAccounts,
  subEnvelopes,
  type Db,
} from "@gastos/db";
import {
  type Account,
  type AccountId,
  accountIdFromString,
  type Category,
  type CategoryId,
  categoryIdFromString,
  currencyCodeFromString,
  type EnvelopeGroup,
  type EnvelopeGroupId,
  envelopeGroupIdFromString,
  type SubEnvelope,
  subEnvelopeIdFromString,
} from "@gastos/shared";
import { eq } from "drizzle-orm";

/** The async Reference-layer store surface, backed by a real Postgres `Db`. */
export interface ReferenceStore {
  getAccounts(): Promise<readonly Account[]>;
  addAccount(account: Account): Promise<void>;
  replaceAccount(account: Account): Promise<void>;
  getCategories(): Promise<readonly Category[]>;
  addCategory(category: Category): Promise<void>;
  replaceCategory(category: Category): Promise<void>;
  deleteCategory(id: CategoryId): Promise<void>;
  getEnvelopeGroups(): Promise<readonly EnvelopeGroup[]>;
  addEnvelopeGroup(envelopeGroup: EnvelopeGroup): Promise<void>;
  replaceEnvelopeGroup(envelopeGroup: EnvelopeGroup): Promise<void>;
  deleteEnvelopeGroup(id: EnvelopeGroupId): Promise<void>;
  getSubEnvelopes(): Promise<readonly SubEnvelope[]>;
  addSubEnvelope(subEnvelope: SubEnvelope): Promise<void>;
  replaceSubEnvelope(subEnvelope: SubEnvelope): Promise<void>;
}

function toAccount(row: typeof accounts.$inferSelect): Account {
  return {
    id: accountIdFromString(row.id),
    name: row.name,
    currency: currencyCodeFromString(row.currency),
    isArchived: row.isArchived,
  };
}

async function getAccountsImpl(db: Db): Promise<readonly Account[]> {
  const rows = await db.select().from(accounts);
  return rows.map(toAccount);
}

async function addAccountImpl(db: Db, account: Account): Promise<void> {
  await db.insert(accounts).values({
    id: account.id,
    name: account.name,
    currency: account.currency,
    isArchived: account.isArchived,
  });
}

async function replaceAccountImpl(db: Db, account: Account): Promise<void> {
  await db
    .update(accounts)
    .set({ name: account.name, currency: account.currency, isArchived: account.isArchived })
    .where(eq(accounts.id, account.id));
}

function toCategory(row: typeof categories.$inferSelect): Category {
  return {
    id: categoryIdFromString(row.id),
    name: row.name,
    isIncome: row.isIncome,
  };
}

async function getCategoriesImpl(db: Db): Promise<readonly Category[]> {
  const rows = await db.select().from(categories);
  return rows.map(toCategory);
}

async function addCategoryImpl(db: Db, category: Category): Promise<void> {
  await db.insert(categories).values({
    id: category.id,
    name: category.name,
    isIncome: category.isIncome,
  });
}

async function replaceCategoryImpl(db: Db, category: Category): Promise<void> {
  await db
    .update(categories)
    .set({ name: category.name, isIncome: category.isIncome })
    .where(eq(categories.id, category.id));
}

async function deleteCategoryImpl(db: Db, id: CategoryId): Promise<void> {
  await db.delete(categories).where(eq(categories.id, id));
}

function toEnvelopeGroup(row: typeof envelopeGroups.$inferSelect): EnvelopeGroup {
  return { id: envelopeGroupIdFromString(row.id), name: row.name };
}

async function getEnvelopeGroupsImpl(db: Db): Promise<readonly EnvelopeGroup[]> {
  const rows = await db.select().from(envelopeGroups);
  return rows.map(toEnvelopeGroup);
}

async function addEnvelopeGroupImpl(db: Db, envelopeGroup: EnvelopeGroup): Promise<void> {
  await db.insert(envelopeGroups).values({ id: envelopeGroup.id, name: envelopeGroup.name });
}

async function replaceEnvelopeGroupImpl(db: Db, envelopeGroup: EnvelopeGroup): Promise<void> {
  await db
    .update(envelopeGroups)
    .set({ name: envelopeGroup.name })
    .where(eq(envelopeGroups.id, envelopeGroup.id));
}

async function deleteEnvelopeGroupImpl(db: Db, id: EnvelopeGroupId): Promise<void> {
  await db.delete(envelopeGroups).where(eq(envelopeGroups.id, id));
}

/**
 * Groups `subEnvelopeAccounts` rows by `subEnvelopeId`, producing the
 * `accountIds` array each `SubEnvelope` needs. A plain in-memory group-by
 * over one extra query — no fancy SQL aggregate needed at this data size.
 */
function groupAccountIdsBySubEnvelopeId(
  rows: readonly (typeof subEnvelopeAccounts.$inferSelect)[],
): Map<string, AccountId[]> {
  const grouped = new Map<string, AccountId[]>();
  for (const row of rows) {
    const accountIds = grouped.get(row.subEnvelopeId) ?? [];
    accountIds.push(accountIdFromString(row.accountId));
    grouped.set(row.subEnvelopeId, accountIds);
  }
  return grouped;
}

async function getSubEnvelopesImpl(db: Db): Promise<readonly SubEnvelope[]> {
  const [subEnvelopeRows, accountRows] = await Promise.all([
    db.select().from(subEnvelopes),
    db.select().from(subEnvelopeAccounts),
  ]);
  const accountIdsBySubEnvelopeId = groupAccountIdsBySubEnvelopeId(accountRows);

  return subEnvelopeRows.map((row) => ({
    id: subEnvelopeIdFromString(row.id),
    name: row.name,
    groupId: row.groupId === null ? null : envelopeGroupIdFromString(row.groupId),
    accountIds: accountIdsBySubEnvelopeId.get(row.id) ?? [],
    isArchived: row.isArchived,
  }));
}

async function addSubEnvelopeImpl(db: Db, subEnvelope: SubEnvelope): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(subEnvelopes).values({
      id: subEnvelope.id,
      name: subEnvelope.name,
      groupId: subEnvelope.groupId,
      isArchived: subEnvelope.isArchived,
    });
    if (subEnvelope.accountIds.length > 0) {
      await tx.insert(subEnvelopeAccounts).values(
        subEnvelope.accountIds.map((accountId) => ({
          subEnvelopeId: subEnvelope.id,
          accountId,
        })),
      );
    }
  });
}

async function replaceSubEnvelopeImpl(db: Db, subEnvelope: SubEnvelope): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(subEnvelopes)
      .set({
        name: subEnvelope.name,
        groupId: subEnvelope.groupId,
        isArchived: subEnvelope.isArchived,
      })
      .where(eq(subEnvelopes.id, subEnvelope.id));

    await tx
      .delete(subEnvelopeAccounts)
      .where(eq(subEnvelopeAccounts.subEnvelopeId, subEnvelope.id));

    if (subEnvelope.accountIds.length > 0) {
      await tx.insert(subEnvelopeAccounts).values(
        subEnvelope.accountIds.map((accountId) => ({
          subEnvelopeId: subEnvelope.id,
          accountId,
        })),
      );
    }
  });
}

/**
 * Builds a `ReferenceStore` backed by `db` — a real Postgres connection for
 * production use (see `apps/server/src/db.ts`), or any other `Db` instance
 * (e.g. a future test's own connection) for anyone else who needs one.
 */
export function createReferenceStore(db: Db): ReferenceStore {
  return {
    getAccounts: () => getAccountsImpl(db),
    addAccount: (account) => addAccountImpl(db, account),
    replaceAccount: (account) => replaceAccountImpl(db, account),
    getCategories: () => getCategoriesImpl(db),
    addCategory: (category) => addCategoryImpl(db, category),
    replaceCategory: (category) => replaceCategoryImpl(db, category),
    deleteCategory: (id) => deleteCategoryImpl(db, id),
    getEnvelopeGroups: () => getEnvelopeGroupsImpl(db),
    addEnvelopeGroup: (envelopeGroup) => addEnvelopeGroupImpl(db, envelopeGroup),
    replaceEnvelopeGroup: (envelopeGroup) => replaceEnvelopeGroupImpl(db, envelopeGroup),
    deleteEnvelopeGroup: (id) => deleteEnvelopeGroupImpl(db, id),
    getSubEnvelopes: () => getSubEnvelopesImpl(db),
    addSubEnvelope: (subEnvelope) => addSubEnvelopeImpl(db, subEnvelope),
    replaceSubEnvelope: (subEnvelope) => replaceSubEnvelopeImpl(db, subEnvelope),
  };
}
