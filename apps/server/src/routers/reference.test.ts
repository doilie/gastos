import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// This router validates ids against Postgres-backed Reference-layer tables
// (accounts/categories/envelope groups/sub-envelopes) at handler-call time,
// so this file needs its own ephemeral, migrated, seeded testcontainers
// Postgres before importing `buildServer`/the store getters, per the
// gastos-coder-documented conversion recipe.
let container: StartedPostgreSqlContainer;
let buildServer: typeof import("../index").buildServer;
let getAccounts: typeof import("../store").getAccounts;
let getCategories: typeof import("../store").getCategories;
let getEnvelopeGroups: typeof import("../store").getEnvelopeGroups;
let getSubEnvelopes: typeof import("../store").getSubEnvelopes;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  process.env["DATABASE_URL"] = container.getConnectionUri();

  const dbModule = await import("../db");
  await dbModule.runMigrations(dbModule.db);
  await dbModule.seedReferenceData(dbModule.db);
  await dbModule.seedRemainingFixtureData(dbModule.db);

  ({ buildServer } = await import("../index"));
  ({ getAccounts, getCategories, getEnvelopeGroups, getSubEnvelopes } = await import("../store"));
}, 60_000);

afterAll(async () => {
  await container.stop();
});

interface TrpcQueryResponse<T> {
  result: { data: T };
}

interface TrpcErrorResponse {
  error: {
    message: string;
    data: {
      code: string;
      httpStatus: number;
      [key: string]: unknown;
    };
  };
}

async function queryReference<T>(
  app: ReturnType<typeof buildServer>,
  procedure: string,
): Promise<T> {
  const response = await app.inject({
    method: "GET",
    url: `/trpc/reference.${procedure}`,
  });
  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body) as TrpcQueryResponse<T>;
  return body.result.data;
}

/**
 * tRPC v11 mutations go over POST with the raw input as the JSON body (no
 * `{ input: ... }` wrapper) — same pattern established in `ledger.test.ts`'s
 * `mutateLedger`/`budget.test.ts`'s `mutateBudget` helpers, adapted here for
 * the `reference` router.
 */
async function mutateReference<T>(
  app: ReturnType<typeof buildServer>,
  procedure: string,
  input: object,
): Promise<T> {
  const response = await app.inject({
    method: "POST",
    url: `/trpc/reference.${procedure}`,
    payload: input,
  });
  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body) as TrpcQueryResponse<T>;
  return body.result.data;
}

/**
 * Like `mutateReference`, but for error-path tests: doesn't assert a 200
 * status up front, just returns the raw HTTP status and the decoded tRPC
 * error envelope so the caller can assert on both — mirrors
 * `budget.test.ts`'s `mutateBudgetExpectingError`.
 */
async function mutateReferenceExpectingError(
  app: ReturnType<typeof buildServer>,
  procedure: string,
  input: object,
): Promise<{ statusCode: number; error: TrpcErrorResponse["error"] }> {
  const response = await app.inject({
    method: "POST",
    url: `/trpc/reference.${procedure}`,
    payload: input,
  });
  const body = JSON.parse(response.body) as TrpcErrorResponse;
  return { statusCode: response.statusCode, error: body.error };
}

interface CreatedAccount {
  id: string;
  name: string;
  currency: string;
  isArchived: boolean;
}

interface CreatedCategory {
  id: string;
  name: string;
  isIncome: boolean;
}

interface CreatedEnvelopeGroup {
  id: string;
  name: string;
}

interface CreatedSubEnvelope {
  id: string;
  name: string;
  groupId: string;
  accountIds: string[];
  isArchived: boolean;
}

describe("reference router", () => {
  it("reference.accounts returns exactly what store.getAccounts() returns", async () => {
    const app = buildServer();
    const data = await queryReference(app, "accounts");
    expect(data).toEqual(await getAccounts());
    await app.close();
  });

  it("reference.categories returns exactly what store.getCategories() returns", async () => {
    const app = buildServer();
    const data = await queryReference(app, "categories");
    expect(data).toEqual(await getCategories());
    await app.close();
  });

  it("reference.envelopeGroups returns exactly what store.getEnvelopeGroups() returns", async () => {
    const app = buildServer();
    const data = await queryReference(app, "envelopeGroups");
    expect(data).toEqual(await getEnvelopeGroups());
    await app.close();
  });

  it("reference.subEnvelopes returns exactly what store.getSubEnvelopes() returns", async () => {
    const app = buildServer();
    const data = await queryReference(app, "subEnvelopes");
    expect(data).toEqual(await getSubEnvelopes());
    await app.close();
  });
});

// NOTE: reference.createAccount/createCategory genuinely mutate the shared
// in-memory store (singleton arrays, same as ledger.addTransaction/
// budget.applyBudgetLine — see store.ts's `accounts`/`categories`). Tests
// below therefore never assert an absolute total count; they check for the
// presence/absence of the specific record they created, so they're safe
// regardless of test order or how many other tests in this file/run already
// mutated the store.

describe("reference.createAccount — success", () => {
  it("creates and returns an Account with a generated id, correct name/currency, isArchived false", async () => {
    const app = buildServer();
    const data = await mutateReference<CreatedAccount>(app, "createAccount", {
      name: "Emergency Fund",
      currency: "PHP",
    });

    expect(typeof data.id).toBe("string");
    expect(data.id.length).toBeGreaterThan(0);
    expect(data.name).toBe("Emergency Fund");
    expect(data.currency).toBe("PHP");
    expect(data.isArchived).toBe(false);
    await app.close();
  });

  it("persists the new account, visible in a fresh reference.accounts request", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedAccount>(app, "createAccount", {
      name: "Vacation Fund",
      currency: "PHP",
    });

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    const found = allAccounts.find((account) => account.id === created.id);
    expect(found).toEqual(created);
    await app.close();
  });
});

describe("reference.createAccount — validation errors", () => {
  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for an invalid lowercase currency code, and does not persist it", async () => {
    const app = buildServer();
    // currencyCodeFromString throws a plain Error (not a TRPCError) for a
    // malformed code — this codebase's established convention lets it
    // propagate unwrapped, which tRPC surfaces as 500/INTERNAL_SERVER_ERROR,
    // not 400/BAD_REQUEST (unlike the Zod-shape-validation failures).
    const { statusCode, error } = await mutateReferenceExpectingError(app, "createAccount", {
      name: "Bad Currency Account",
      currency: "usd",
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    expect(allAccounts.some((account) => account.name === "Bad Currency Account")).toBe(false);
    await app.close();
  });

  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for a 4-letter currency code, and does not persist it", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(app, "createAccount", {
      name: "Bad Currency Account 2",
      currency: "USDX",
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    expect(allAccounts.some((account) => account.name === "Bad Currency Account 2")).toBe(false);
    await app.close();
  });

  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for an empty/whitespace-only name, and does not persist it", async () => {
    const app = buildServer();
    // The underlying createAccount factory throws a plain Error for a
    // blank name — same unwrapped-propagation convention as above.
    const { statusCode, error } = await mutateReferenceExpectingError(app, "createAccount", {
      name: "   ",
      currency: "PHP",
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    expect(allAccounts.some((account) => account.name.trim() === "")).toBe(false);
    await app.close();
  });
});

describe("reference.createCategory — success", () => {
  it("defaults isIncome to false when omitted, and persists it", async () => {
    const app = buildServer();
    const data = await mutateReference<CreatedCategory>(app, "createCategory", {
      name: "Utilities",
    });

    expect(typeof data.id).toBe("string");
    expect(data.id.length).toBeGreaterThan(0);
    expect(data.name).toBe("Utilities");
    expect(data.isIncome).toBe(false);

    const allCategories = await queryReference<CreatedCategory[]>(app, "categories");
    const found = allCategories.find((category) => category.id === data.id);
    expect(found).toEqual(data);
    await app.close();
  });

  it("respects isIncome: true when explicitly provided", async () => {
    const app = buildServer();
    const data = await mutateReference<CreatedCategory>(app, "createCategory", {
      name: "Freelance Income",
      isIncome: true,
    });

    expect(data.isIncome).toBe(true);
    await app.close();
  });
});

describe("reference.createCategory — validation errors", () => {
  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for an empty/whitespace-only name, and does not persist it", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(app, "createCategory", {
      name: "   ",
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allCategories = await queryReference<CreatedCategory[]>(app, "categories");
    expect(allCategories.some((category) => category.name.trim() === "")).toBe(false);
    await app.close();
  });
});

// NOTE: reference.updateAccount/updateCategory tests below each create a
// FRESH account/category via createAccount/createCategory first, then update
// THAT record — never a seeded one (e.g. account-checking) — to avoid
// leaking mutated state into other tests sharing this singleton in-memory
// store, per this file's existing createAccount/createCategory precedent.

describe("reference.updateAccount — success", () => {
  it("updates name only, leaving currency/isArchived/id unchanged, and persists it", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedAccount>(app, "createAccount", {
      name: "Original Name",
      currency: "PHP",
    });

    const updated = await mutateReference<CreatedAccount>(app, "updateAccount", {
      id: created.id,
      name: "Renamed Account",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("Renamed Account");
    expect(updated.currency).toBe(created.currency);
    expect(updated.isArchived).toBe(created.isArchived);

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    const found = allAccounts.find((account) => account.id === created.id);
    expect(found).toEqual(updated);
    await app.close();
  });

  it("updates currency only, leaving name/id unchanged, and persists it", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedAccount>(app, "createAccount", {
      name: "Currency Test Account",
      currency: "PHP",
    });

    const updated = await mutateReference<CreatedAccount>(app, "updateAccount", {
      id: created.id,
      currency: "USD",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe(created.name);
    expect(updated.currency).toBe("USD");

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    const found = allAccounts.find((account) => account.id === created.id);
    expect(found).toEqual(updated);
    await app.close();
  });

  it("updates both name and currency at once, and persists it", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedAccount>(app, "createAccount", {
      name: "Both Fields Account",
      currency: "PHP",
    });

    const updated = await mutateReference<CreatedAccount>(app, "updateAccount", {
      id: created.id,
      name: "Renamed Both",
      currency: "USD",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("Renamed Both");
    expect(updated.currency).toBe("USD");

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    const found = allAccounts.find((account) => account.id === created.id);
    expect(found).toEqual(updated);
    await app.close();
  });
});

describe("reference.updateAccount — validation errors", () => {
  it("returns NOT_FOUND (404) for a well-formed but nonexistent id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(app, "updateAccount", {
      id: "account-does-not-exist",
      name: "Doesn't Matter",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for an invalid lowercase currency code, and does not change the account", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedAccount>(app, "createAccount", {
      name: "Invalid Currency Update Account",
      currency: "PHP",
    });

    const { statusCode, error } = await mutateReferenceExpectingError(app, "updateAccount", {
      id: created.id,
      currency: "usd",
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    const found = allAccounts.find((account) => account.id === created.id);
    expect(found?.currency).toBe("PHP");
    await app.close();
  });
});

describe("reference.updateCategory — success", () => {
  it("updates name only, leaving isIncome/id unchanged, and persists it", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedCategory>(app, "createCategory", {
      name: "Original Category Name",
    });

    const updated = await mutateReference<CreatedCategory>(app, "updateCategory", {
      id: created.id,
      name: "Renamed Category",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("Renamed Category");
    expect(updated.isIncome).toBe(created.isIncome);

    const allCategories = await queryReference<CreatedCategory[]>(app, "categories");
    const found = allCategories.find((category) => category.id === created.id);
    expect(found).toEqual(updated);
    await app.close();
  });

  it("updates isIncome only, leaving name/id unchanged, and persists it", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedCategory>(app, "createCategory", {
      name: "IsIncome Test Category",
    });

    const updated = await mutateReference<CreatedCategory>(app, "updateCategory", {
      id: created.id,
      isIncome: true,
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe(created.name);
    expect(updated.isIncome).toBe(true);

    const allCategories = await queryReference<CreatedCategory[]>(app, "categories");
    const found = allCategories.find((category) => category.id === created.id);
    expect(found).toEqual(updated);
    await app.close();
  });

  it("updates both name and isIncome at once, and persists it", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedCategory>(app, "createCategory", {
      name: "Both Fields Category",
    });

    const updated = await mutateReference<CreatedCategory>(app, "updateCategory", {
      id: created.id,
      name: "Renamed Both Category",
      isIncome: true,
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("Renamed Both Category");
    expect(updated.isIncome).toBe(true);

    const allCategories = await queryReference<CreatedCategory[]>(app, "categories");
    const found = allCategories.find((category) => category.id === created.id);
    expect(found).toEqual(updated);
    await app.close();
  });
});

// NOTE: reference.archiveAccount/unarchiveAccount tests below each create a
// FRESH account via createAccount first, then archive/unarchive THAT record —
// never a seeded one — per this file's existing createAccount/updateAccount
// precedent.

describe("reference.archiveAccount — success", () => {
  it("sets isArchived to true, leaving id/name/currency unchanged, and persists it", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedAccount>(app, "createAccount", {
      name: "Archive Me",
      currency: "PHP",
    });

    const archived = await mutateReference<CreatedAccount>(app, "archiveAccount", {
      id: created.id,
    });

    expect(archived.id).toBe(created.id);
    expect(archived.name).toBe(created.name);
    expect(archived.currency).toBe(created.currency);
    expect(archived.isArchived).toBe(true);

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    const found = allAccounts.find((account) => account.id === created.id);
    expect(found).toEqual(archived);
    await app.close();
  });
});

describe("reference.unarchiveAccount — success", () => {
  it("sets isArchived back to false on a previously-archived account, leaving id/name/currency unchanged, and persists it", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedAccount>(app, "createAccount", {
      name: "Archive Then Unarchive Me",
      currency: "PHP",
    });

    const archived = await mutateReference<CreatedAccount>(app, "archiveAccount", {
      id: created.id,
    });
    expect(archived.isArchived).toBe(true);

    const unarchived = await mutateReference<CreatedAccount>(app, "unarchiveAccount", {
      id: created.id,
    });

    expect(unarchived.id).toBe(created.id);
    expect(unarchived.name).toBe(created.name);
    expect(unarchived.currency).toBe(created.currency);
    expect(unarchived.isArchived).toBe(false);

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    const found = allAccounts.find((account) => account.id === created.id);
    expect(found).toEqual(unarchived);
    await app.close();
  });
});

describe("reference.archiveAccount/unarchiveAccount — validation errors", () => {
  it("archiveAccount returns NOT_FOUND (404) for a well-formed but nonexistent id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(app, "archiveAccount", {
      id: "account-does-not-exist",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("unarchiveAccount returns NOT_FOUND (404) for a well-formed but nonexistent id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(app, "unarchiveAccount", {
      id: "account-does-not-exist",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });
});

// NOTE: reference.deleteCategory tests below rely on the seeded
// "category-groceries" category (see store.ts) being referenced by the
// seeded "txn-groceries-1"/"txn-groceries-2" transactions — this is existing
// seed data, not something these tests create, so the "in use" rejection
// test targets it specifically rather than a freshly-created category.

describe("reference.deleteCategory — rejected (still in use)", () => {
  it("returns BAD_REQUEST (400) for a category referenced by an existing transaction, and does not remove it", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(app, "deleteCategory", {
      id: "category-groceries",
    });
    expect(statusCode).toBe(400);
    expect(error.data.code).toBe("BAD_REQUEST");
    expect(error.message).toBe(
      'Category "category-groceries" is still in use and cannot be deleted',
    );

    const allCategories = await queryReference<CreatedCategory[]>(app, "categories");
    expect(allCategories.some((category) => category.id === "category-groceries")).toBe(true);
    await app.close();
  });
});

describe("reference.deleteCategory — success", () => {
  it("removes an unreferenced (freshly-created) category and returns its id", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedCategory>(app, "createCategory", {
      name: "Unreferenced Category",
    });

    const result = await mutateReference<{ id: string }>(app, "deleteCategory", {
      id: created.id,
    });
    expect(result).toEqual({ id: created.id });

    const allCategories = await queryReference<CreatedCategory[]>(app, "categories");
    expect(allCategories.some((category) => category.id === created.id)).toBe(false);
    await app.close();
  });
});

describe("reference.deleteCategory — validation errors", () => {
  it("returns NOT_FOUND (404) for a well-formed but nonexistent id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(app, "deleteCategory", {
      id: "category-does-not-exist",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });
});

describe("reference.updateCategory — validation errors", () => {
  it("returns NOT_FOUND (404) for a well-formed but nonexistent id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(app, "updateCategory", {
      id: "category-does-not-exist",
      name: "Doesn't Matter",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for an empty/whitespace-only name, and does not change the category", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedCategory>(app, "createCategory", {
      name: "Empty Name Update Category",
    });

    const { statusCode, error } = await mutateReferenceExpectingError(app, "updateCategory", {
      id: created.id,
      name: "   ",
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allCategories = await queryReference<CreatedCategory[]>(app, "categories");
    const found = allCategories.find((category) => category.id === created.id);
    expect(found?.name).toBe("Empty Name Update Category");
    await app.close();
  });
});

// NOTE: reference.createEnvelopeGroup/createSubEnvelope tests below follow
// the same shared-in-memory-store discipline as createAccount/createCategory
// above — never assert an absolute total count, only presence/correctness of
// the specific record created. createSubEnvelope tests use the seeded
// "account-checking" account id (see store.ts) as a real account to satisfy
// its accountIds validation, and create a fresh EnvelopeGroup via
// createEnvelopeGroup first rather than relying on a seeded one.

describe("reference.createEnvelopeGroup — success", () => {
  it("creates and returns an EnvelopeGroup with a generated id and correct name, and persists it", async () => {
    const app = buildServer();
    const data = await mutateReference<CreatedEnvelopeGroup>(app, "createEnvelopeGroup", {
      name: "Savings Goals",
    });

    expect(typeof data.id).toBe("string");
    expect(data.id.length).toBeGreaterThan(0);
    expect(data.name).toBe("Savings Goals");

    const allGroups = await queryReference<CreatedEnvelopeGroup[]>(app, "envelopeGroups");
    const found = allGroups.find((group) => group.id === data.id);
    expect(found).toEqual(data);
    await app.close();
  });
});

describe("reference.createEnvelopeGroup — validation errors", () => {
  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for an empty/whitespace-only name, and does not persist it", async () => {
    const app = buildServer();
    // createEnvelopeGroup (the shared factory) throws a plain Error for a
    // blank name — same unwrapped-propagation convention as
    // createAccount/createCategory, surfacing as 500, not 400.
    const { statusCode, error } = await mutateReferenceExpectingError(app, "createEnvelopeGroup", {
      name: "   ",
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allGroups = await queryReference<CreatedEnvelopeGroup[]>(app, "envelopeGroups");
    expect(allGroups.some((group) => group.name.trim() === "")).toBe(false);
    await app.close();
  });
});

describe("reference.createSubEnvelope — success", () => {
  it("creates and returns a SubEnvelope with a generated id, correct name/groupId/accountIds, and persists it", async () => {
    const app = buildServer();
    const group = await mutateReference<CreatedEnvelopeGroup>(app, "createEnvelopeGroup", {
      name: "Sub Envelope Success Group",
    });

    const data = await mutateReference<CreatedSubEnvelope>(app, "createSubEnvelope", {
      name: "New Gadget Fund",
      groupId: group.id,
      accountIds: ["account-checking"],
    });

    expect(typeof data.id).toBe("string");
    expect(data.id.length).toBeGreaterThan(0);
    expect(data.name).toBe("New Gadget Fund");
    expect(data.groupId).toBe(group.id);
    expect(data.accountIds).toEqual(["account-checking"]);

    const allSubEnvelopes = await queryReference<CreatedSubEnvelope[]>(app, "subEnvelopes");
    const found = allSubEnvelopes.find((subEnvelope) => subEnvelope.id === data.id);
    expect(found).toEqual(data);
    await app.close();
  });
});

// Split into two `describe` blocks (rather than one long one) purely to stay
// under this repo's max-lines-per-function ESLint cap on the `describe`
// callback itself — grouped by NOT_FOUND-style id-lookup failures vs.
// shape/factory-level validation failures. No test case's behavior or
// assertions changed as part of this split.

describe("reference.createSubEnvelope — validation errors (id lookup)", () => {
  it("returns NOT_FOUND (404) for a nonexistent groupId, and does not persist it", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(app, "createSubEnvelope", {
      name: "Orphan Sub Envelope",
      groupId: "envelope-group-does-not-exist",
      accountIds: ["account-checking"],
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");

    const allSubEnvelopes = await queryReference<CreatedSubEnvelope[]>(app, "subEnvelopes");
    expect(allSubEnvelopes.some((subEnvelope) => subEnvelope.name === "Orphan Sub Envelope")).toBe(
      false,
    );
    await app.close();
  });

  it("returns NOT_FOUND (404) when one of the accountIds does not exist, and does not persist it", async () => {
    const app = buildServer();
    const group = await mutateReference<CreatedEnvelopeGroup>(app, "createEnvelopeGroup", {
      name: "Bad Account Id Group",
    });

    const { statusCode, error } = await mutateReferenceExpectingError(app, "createSubEnvelope", {
      name: "Bad Account Sub Envelope",
      groupId: group.id,
      accountIds: ["account-checking", "account-does-not-exist"],
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");

    const allSubEnvelopes = await queryReference<CreatedSubEnvelope[]>(app, "subEnvelopes");
    expect(
      allSubEnvelopes.some((subEnvelope) => subEnvelope.name === "Bad Account Sub Envelope"),
    ).toBe(false);
    await app.close();
  });
});

describe("reference.createSubEnvelope — validation errors (shape/factory)", () => {
  it("returns BAD_REQUEST (400) for an empty accountIds array (Zod's .min(1) shape validation)", async () => {
    const app = buildServer();
    const group = await mutateReference<CreatedEnvelopeGroup>(app, "createEnvelopeGroup", {
      name: "Empty AccountIds Group",
    });

    const { statusCode, error } = await mutateReferenceExpectingError(app, "createSubEnvelope", {
      name: "No Accounts Sub Envelope",
      groupId: group.id,
      accountIds: [],
    });
    expect(statusCode).toBe(400);
    expect(error.data.code).toBe("BAD_REQUEST");

    const allSubEnvelopes = await queryReference<CreatedSubEnvelope[]>(app, "subEnvelopes");
    expect(
      allSubEnvelopes.some((subEnvelope) => subEnvelope.name === "No Accounts Sub Envelope"),
    ).toBe(false);
    await app.close();
  });

  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for an empty/whitespace-only name, and does not persist it", async () => {
    const app = buildServer();
    const group = await mutateReference<CreatedEnvelopeGroup>(app, "createEnvelopeGroup", {
      name: "Empty Name Sub Envelope Group",
    });

    // createSubEnvelope (the shared factory) throws a plain Error for a
    // blank name — same unwrapped-propagation convention as above, since
    // Zod's own schema only requires `name` to be a string, not non-empty.
    const { statusCode, error } = await mutateReferenceExpectingError(app, "createSubEnvelope", {
      name: "   ",
      groupId: group.id,
      accountIds: ["account-checking"],
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allSubEnvelopes = await queryReference<CreatedSubEnvelope[]>(app, "subEnvelopes");
    expect(allSubEnvelopes.some((subEnvelope) => subEnvelope.name.trim() === "")).toBe(false);
    await app.close();
  });

  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for duplicate entries in accountIds, and does not persist it", async () => {
    const app = buildServer();
    const group = await mutateReference<CreatedEnvelopeGroup>(app, "createEnvelopeGroup", {
      name: "Duplicate AccountIds Group",
    });

    // Each entry individually resolves to a real account (the router's own
    // assertIdExists loop only checks existence per-entry, not uniqueness),
    // so this failure comes from the shared factory's own duplicate check —
    // same unwrapped-propagation convention as above.
    const { statusCode, error } = await mutateReferenceExpectingError(app, "createSubEnvelope", {
      name: "Duplicate Account Sub Envelope",
      groupId: group.id,
      accountIds: ["account-checking", "account-checking"],
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allSubEnvelopes = await queryReference<CreatedSubEnvelope[]>(app, "subEnvelopes");
    expect(
      allSubEnvelopes.some((subEnvelope) => subEnvelope.name === "Duplicate Account Sub Envelope"),
    ).toBe(false);
    await app.close();
  });
});

// NOTE: reference.updateEnvelopeGroup/updateSubEnvelope tests below each
// create a FRESH EnvelopeGroup/SubEnvelope via createEnvelopeGroup/
// createSubEnvelope first, then update THAT record — never a seeded one —
// per this file's existing createAccount/updateAccount precedent. They use
// the seeded "account-checking"/"account-savings" account ids (see store.ts)
// as real accounts to satisfy accountIds validation.

describe("reference.updateEnvelopeGroup — success", () => {
  it("updates name only, leaving id unchanged, and persists it", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedEnvelopeGroup>(app, "createEnvelopeGroup", {
      name: "Original Group Name",
    });

    const updated = await mutateReference<CreatedEnvelopeGroup>(app, "updateEnvelopeGroup", {
      id: created.id,
      name: "Renamed Group",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("Renamed Group");

    const allGroups = await queryReference<CreatedEnvelopeGroup[]>(app, "envelopeGroups");
    const found = allGroups.find((group) => group.id === created.id);
    expect(found).toEqual(updated);
    await app.close();
  });
});

describe("reference.updateEnvelopeGroup — validation errors", () => {
  it("returns NOT_FOUND (404) for a well-formed but nonexistent id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(app, "updateEnvelopeGroup", {
      id: "envelope-group-does-not-exist",
      name: "Doesn't Matter",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for an empty/whitespace-only name, and does not change the group", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedEnvelopeGroup>(app, "createEnvelopeGroup", {
      name: "Empty Name Update Group",
    });

    const { statusCode, error } = await mutateReferenceExpectingError(app, "updateEnvelopeGroup", {
      id: created.id,
      name: "   ",
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allGroups = await queryReference<CreatedEnvelopeGroup[]>(app, "envelopeGroups");
    const found = allGroups.find((group) => group.id === created.id);
    expect(found?.name).toBe("Empty Name Update Group");
    await app.close();
  });
});

describe("reference.updateSubEnvelope — success", () => {
  it("updates name only, leaving accountIds/groupId/id unchanged, and persists it", async () => {
    const app = buildServer();
    const group = await mutateReference<CreatedEnvelopeGroup>(app, "createEnvelopeGroup", {
      name: "Update SubEnvelope Name Group",
    });
    const created = await mutateReference<CreatedSubEnvelope>(app, "createSubEnvelope", {
      name: "Original SubEnvelope Name",
      groupId: group.id,
      accountIds: ["account-checking"],
    });

    const updated = await mutateReference<CreatedSubEnvelope>(app, "updateSubEnvelope", {
      id: created.id,
      name: "Renamed SubEnvelope",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.groupId).toBe(created.groupId);
    expect(updated.accountIds).toEqual(created.accountIds);
    expect(updated.name).toBe("Renamed SubEnvelope");

    const allSubEnvelopes = await queryReference<CreatedSubEnvelope[]>(app, "subEnvelopes");
    const found = allSubEnvelopes.find((subEnvelope) => subEnvelope.id === created.id);
    expect(found).toEqual(updated);
    await app.close();
  });

  it("updates accountIds only, leaving name/groupId/id unchanged, and persists it", async () => {
    const app = buildServer();
    const group = await mutateReference<CreatedEnvelopeGroup>(app, "createEnvelopeGroup", {
      name: "Update SubEnvelope AccountIds Group",
    });
    const created = await mutateReference<CreatedSubEnvelope>(app, "createSubEnvelope", {
      name: "AccountIds Test SubEnvelope",
      groupId: group.id,
      accountIds: ["account-checking"],
    });

    const updated = await mutateReference<CreatedSubEnvelope>(app, "updateSubEnvelope", {
      id: created.id,
      accountIds: ["account-savings"],
    });

    expect(updated.id).toBe(created.id);
    expect(updated.groupId).toBe(created.groupId);
    expect(updated.name).toBe(created.name);
    expect(updated.accountIds).toEqual(["account-savings"]);

    const allSubEnvelopes = await queryReference<CreatedSubEnvelope[]>(app, "subEnvelopes");
    const found = allSubEnvelopes.find((subEnvelope) => subEnvelope.id === created.id);
    expect(found).toEqual(updated);
    await app.close();
  });
});

describe("reference.updateSubEnvelope — validation errors", () => {
  it("returns NOT_FOUND (404) for a well-formed but nonexistent id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(app, "updateSubEnvelope", {
      id: "sub-envelope-does-not-exist",
      name: "Doesn't Matter",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns NOT_FOUND (404) when one of the accountIds does not exist, and does not change accountIds", async () => {
    const app = buildServer();
    const group = await mutateReference<CreatedEnvelopeGroup>(app, "createEnvelopeGroup", {
      name: "Bad Update AccountIds Group",
    });
    const created = await mutateReference<CreatedSubEnvelope>(app, "createSubEnvelope", {
      name: "Bad Update Account SubEnvelope",
      groupId: group.id,
      accountIds: ["account-checking"],
    });

    const { statusCode, error } = await mutateReferenceExpectingError(app, "updateSubEnvelope", {
      id: created.id,
      accountIds: ["account-does-not-exist"],
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");

    const allSubEnvelopes = await queryReference<CreatedSubEnvelope[]>(app, "subEnvelopes");
    const found = allSubEnvelopes.find((subEnvelope) => subEnvelope.id === created.id);
    expect(found?.accountIds).toEqual(["account-checking"]);
    await app.close();
  });

  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for an empty/whitespace-only name, and does not change the sub-envelope", async () => {
    const app = buildServer();
    const group = await mutateReference<CreatedEnvelopeGroup>(app, "createEnvelopeGroup", {
      name: "Empty Name Update SubEnvelope Group",
    });
    const created = await mutateReference<CreatedSubEnvelope>(app, "createSubEnvelope", {
      name: "Empty Name Update SubEnvelope",
      groupId: group.id,
      accountIds: ["account-checking"],
    });

    const { statusCode, error } = await mutateReferenceExpectingError(app, "updateSubEnvelope", {
      id: created.id,
      name: "   ",
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allSubEnvelopes = await queryReference<CreatedSubEnvelope[]>(app, "subEnvelopes");
    const found = allSubEnvelopes.find((subEnvelope) => subEnvelope.id === created.id);
    expect(found?.name).toBe("Empty Name Update SubEnvelope");
    await app.close();
  });
});

// NOTE: reference.archiveSubEnvelope/unarchiveSubEnvelope tests below each
// create a FRESH EnvelopeGroup/SubEnvelope via createEnvelopeGroup/
// createSubEnvelope first, then archive/unarchive THAT record — never a
// seeded one — per this file's existing createAccount/archiveAccount
// precedent. The 500/INTERNAL_SERVER_ERROR-on-Spendable case necessarily
// targets the seeded reserved "spendable" id (SPENDABLE_ENVELOPE_ID) itself,
// since it's the only sub-envelope archiveSubEnvelope ever rejects — but
// archiving it is expected to always fail (never actually persisted), so
// this doesn't mutate shared state in a way that leaks into other tests.

describe("reference.archiveSubEnvelope — success", () => {
  it("sets isArchived to true, leaving id/name/groupId/accountIds unchanged, and persists it", async () => {
    const app = buildServer();
    const group = await mutateReference<CreatedEnvelopeGroup>(app, "createEnvelopeGroup", {
      name: "Archive SubEnvelope Group",
    });
    const created = await mutateReference<CreatedSubEnvelope>(app, "createSubEnvelope", {
      name: "Archive Me SubEnvelope",
      groupId: group.id,
      accountIds: ["account-checking"],
    });

    const archived = await mutateReference<CreatedSubEnvelope>(app, "archiveSubEnvelope", {
      id: created.id,
    });

    expect(archived.id).toBe(created.id);
    expect(archived.name).toBe(created.name);
    expect(archived.groupId).toBe(created.groupId);
    expect(archived.accountIds).toEqual(created.accountIds);
    expect(archived.isArchived).toBe(true);

    const allSubEnvelopes = await queryReference<CreatedSubEnvelope[]>(app, "subEnvelopes");
    const found = allSubEnvelopes.find((subEnvelope) => subEnvelope.id === created.id);
    expect(found).toEqual(archived);
    await app.close();
  });
});

describe("reference.unarchiveSubEnvelope — success", () => {
  it("sets isArchived back to false on a previously-archived sub-envelope, leaving id/name/groupId/accountIds unchanged, and persists it", async () => {
    const app = buildServer();
    const group = await mutateReference<CreatedEnvelopeGroup>(app, "createEnvelopeGroup", {
      name: "Archive Then Unarchive SubEnvelope Group",
    });
    const created = await mutateReference<CreatedSubEnvelope>(app, "createSubEnvelope", {
      name: "Archive Then Unarchive Me SubEnvelope",
      groupId: group.id,
      accountIds: ["account-checking"],
    });

    const archived = await mutateReference<CreatedSubEnvelope>(app, "archiveSubEnvelope", {
      id: created.id,
    });
    expect(archived.isArchived).toBe(true);

    const unarchived = await mutateReference<CreatedSubEnvelope>(app, "unarchiveSubEnvelope", {
      id: created.id,
    });

    expect(unarchived.id).toBe(created.id);
    expect(unarchived.name).toBe(created.name);
    expect(unarchived.groupId).toBe(created.groupId);
    expect(unarchived.accountIds).toEqual(created.accountIds);
    expect(unarchived.isArchived).toBe(false);

    const allSubEnvelopes = await queryReference<CreatedSubEnvelope[]>(app, "subEnvelopes");
    const found = allSubEnvelopes.find((subEnvelope) => subEnvelope.id === created.id);
    expect(found).toEqual(unarchived);
    await app.close();
  });
});

describe("reference.archiveSubEnvelope/unarchiveSubEnvelope — validation errors", () => {
  it("archiveSubEnvelope returns NOT_FOUND (404) for a well-formed but nonexistent id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(app, "archiveSubEnvelope", {
      id: "sub-envelope-does-not-exist",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("unarchiveSubEnvelope returns NOT_FOUND (404) for a well-formed but nonexistent id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(
      app,
      "unarchiveSubEnvelope",
      { id: "sub-envelope-does-not-exist" },
    );
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("archiveSubEnvelope returns a non-2xx (INTERNAL_SERVER_ERROR/500) for the reserved Spendable envelope id, and does not archive it", async () => {
    const app = buildServer();
    // archiveSubEnvelope (the shared domain function) throws a plain Error
    // for the reserved SPENDABLE_ENVELOPE_ID — same unwrapped-propagation
    // convention as createAccount/createSubEnvelope's factory-level
    // failures, surfacing as 500, not 400.
    const { statusCode, error } = await mutateReferenceExpectingError(app, "archiveSubEnvelope", {
      id: "spendable",
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allSubEnvelopes = await queryReference<CreatedSubEnvelope[]>(app, "subEnvelopes");
    const spendable = allSubEnvelopes.find((subEnvelope) => subEnvelope.id === "spendable");
    expect(spendable?.isArchived).toBe(false);
    await app.close();
  });
});

// NOTE: reference.deleteEnvelopeGroup tests below rely on the seeded
// "envelope-group-everyday" group (see store.ts) being referenced by the
// seeded "sub-envelope-groceries-fund" sub-envelope — this is existing seed
// data, not something these tests create, so the "in use" rejection test
// targets it specifically rather than a freshly-created group, mirroring
// reference.deleteCategory's "still in use" test above.

describe("reference.deleteEnvelopeGroup — rejected (still in use)", () => {
  it("returns BAD_REQUEST (400) for a group referenced by an existing sub-envelope, and does not remove it", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(
      app,
      "deleteEnvelopeGroup",
      { id: "envelope-group-everyday" },
    );
    expect(statusCode).toBe(400);
    expect(error.data.code).toBe("BAD_REQUEST");
    expect(error.message).toBe(
      'Envelope group "envelope-group-everyday" is still in use and cannot be deleted',
    );

    const allGroups = await queryReference<CreatedEnvelopeGroup[]>(app, "envelopeGroups");
    expect(allGroups.some((group) => group.id === "envelope-group-everyday")).toBe(true);
    await app.close();
  });
});

describe("reference.deleteEnvelopeGroup — success", () => {
  it("removes an unreferenced (freshly-created) group and returns its id", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedEnvelopeGroup>(app, "createEnvelopeGroup", {
      name: "Unreferenced Envelope Group",
    });

    const result = await mutateReference<{ id: string }>(app, "deleteEnvelopeGroup", {
      id: created.id,
    });
    expect(result).toEqual({ id: created.id });

    const allGroups = await queryReference<CreatedEnvelopeGroup[]>(app, "envelopeGroups");
    expect(allGroups.some((group) => group.id === created.id)).toBe(false);
    await app.close();
  });
});

describe("reference.deleteEnvelopeGroup — validation errors", () => {
  it("returns NOT_FOUND (404) for a well-formed but nonexistent id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(
      app,
      "deleteEnvelopeGroup",
      { id: "envelope-group-does-not-exist" },
    );
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });
});
