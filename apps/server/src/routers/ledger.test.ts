import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  accountIdFromString,
  deriveAccountBalance,
  deriveSubEnvelopeBalance,
  SPENDABLE_ENVELOPE_ID,
  subEnvelopeIdFromString,
} from "@gastos/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// This router validates transaction account/sub-envelope/category ids
// against Postgres-backed Reference-layer tables at handler-call time, so
// this file needs its own ephemeral, migrated, seeded testcontainers
// Postgres before importing `buildServer`, per the gastos-coder-documented
// conversion recipe. getTransactions is now also Postgres-backed (async),
// and still comes from the same dynamically-imported `../store` module
// since it can't be statically imported before DATABASE_URL is set.
let container: StartedPostgreSqlContainer;
let buildServer: typeof import("../index").buildServer;
let getTransactions: typeof import("../store").getTransactions;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  process.env["DATABASE_URL"] = container.getConnectionUri();

  const dbModule = await import("../db");
  await dbModule.runMigrations(dbModule.db);
  await dbModule.seedReferenceData(dbModule.db);
  await dbModule.seedRemainingFixtureData(dbModule.db);

  ({ buildServer } = await import("../index"));
  ({ getTransactions } = await import("../store"));
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

async function queryLedger<T>(
  app: ReturnType<typeof buildServer>,
  procedure: string,
): Promise<T> {
  const response = await app.inject({
    method: "GET",
    url: `/trpc/ledger.${procedure}`,
  });
  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body) as TrpcQueryResponse<T>;
  return body.result.data;
}

/**
 * Builds the tRPC v11 GET query URL for a parameterized procedure: input is
 * a URL-encoded JSON query parameter (`?input=<encodeURIComponent(JSON)>`).
 */
function ledgerQueryUrl(procedure: string, input: unknown): string {
  return `/trpc/ledger.${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`;
}

/**
 * Like `queryLedger`, but for procedures that take input and are expected to
 * succeed (200) — returns the decoded result data.
 */
async function queryLedgerWithInput<T>(
  app: ReturnType<typeof buildServer>,
  procedure: string,
  input: unknown,
): Promise<T> {
  const response = await app.inject({
    method: "GET",
    url: ledgerQueryUrl(procedure, input),
  });
  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body) as TrpcQueryResponse<T>;
  return body.result.data;
}

/**
 * Like `queryLedgerWithInput`, but for error-path tests: doesn't assert a
 * 200 status up front, just returns the raw HTTP status and the decoded
 * tRPC error envelope so the caller can assert on both.
 */
async function queryLedgerExpectingError(
  app: ReturnType<typeof buildServer>,
  procedure: string,
  input: unknown,
): Promise<{ statusCode: number; error: TrpcErrorResponse["error"] }> {
  const response = await app.inject({
    method: "GET",
    url: ledgerQueryUrl(procedure, input),
  });
  const body = JSON.parse(response.body) as TrpcErrorResponse;
  return { statusCode: response.statusCode, error: body.error };
}

/**
 * tRPC v11 mutations go over POST with the raw input as the JSON body (no
 * `{ input: ... }` wrapper — that shape was tried and produced "expected
 * string, received undefined" for every field; the plain input body is the
 * one that actually round-trips, confirmed against the running server).
 * Asserts 200 up front, like `queryLedgerWithInput` does for queries.
 */
async function mutateLedger<T>(
  app: ReturnType<typeof buildServer>,
  procedure: string,
  input: object,
): Promise<T> {
  const response = await app.inject({
    method: "POST",
    url: `/trpc/ledger.${procedure}`,
    payload: input,
  });
  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body) as TrpcQueryResponse<T>;
  return body.result.data;
}

/**
 * Like `mutateLedger`, but for error-path tests: doesn't assert a 200 status
 * up front, just returns the raw HTTP status and the decoded tRPC error
 * envelope so the caller can assert on both.
 */
async function mutateLedgerExpectingError(
  app: ReturnType<typeof buildServer>,
  procedure: string,
  input: object,
): Promise<{ statusCode: number; error: TrpcErrorResponse["error"] }> {
  const response = await app.inject({
    method: "POST",
    url: `/trpc/ledger.${procedure}`,
    payload: input,
  });
  const body = JSON.parse(response.body) as TrpcErrorResponse;
  return { statusCode: response.statusCode, error: body.error };
}

interface AddTransactionInput {
  date: string;
  description: string;
  categoryId: string | null;
  accountId: string;
  subEnvelopeId: string;
  amount: string;
}

interface AddedTransaction {
  id: string;
  date: string;
  description: string;
  categoryId: string | null;
  accountId: string;
  subEnvelopeId: string;
  counterTransactionId: string | null;
  amount: number;
}

/** A well-formed `addTransaction` input, valid against the seeded store. */
function validAddTransactionInput(overrides: Partial<AddTransactionInput> = {}): AddTransactionInput {
  return {
    date: "2026-08-15",
    description: "Coffee",
    categoryId: "category-groceries",
    accountId: "account-checking",
    subEnvelopeId: "spendable",
    amount: "-150.00",
    ...overrides,
  };
}

describe("ledger.transactions", () => {
  it("returns exactly what store.getTransactions() returns", async () => {
    const app = buildServer();
    const data = await queryLedger(app, "transactions");
    expect(data).toEqual(await getTransactions());
    await app.close();
  });
});

describe("ledger.spendableBalance", () => {
  it("returns the Spendable envelope balance derived from store.getTransactions()", async () => {
    const app = buildServer();
    const data = await queryLedger(app, "spendableBalance");
    // Computed independently from getTransactions() here rather than reused
    // from the router's own implementation, so this is a real assertion
    // about what the endpoint returns, not a tautology.
    const expectedBalance = deriveSubEnvelopeBalance(await getTransactions(), SPENDABLE_ENVELOPE_ID);
    expect(data).toBe(expectedBalance);
    await app.close();
  });
});

describe("ledger.accountBalance", () => {
  it("returns the balance derived from store.getTransactions() for an existing account", async () => {
    const app = buildServer();
    const data = await queryLedgerWithInput<number>(app, "accountBalance", {
      accountId: "account-checking",
    });
    // Computed independently from getTransactions() here rather than reused
    // from the router's own implementation, so this is a real assertion
    // about what the endpoint returns, not a tautology.
    const expectedBalance = deriveAccountBalance(
      await getTransactions(),
      accountIdFromString("account-checking"),
    );
    expect(data).toBe(expectedBalance);
    await app.close();
  });

  it("returns NOT_FOUND (404) for a well-formed but nonexistent account id", async () => {
    const app = buildServer();
    const { statusCode, error } = await queryLedgerExpectingError(app, "accountBalance", {
      accountId: "account-does-not-exist",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns BAD_REQUEST (400) when accountId is missing from the input", async () => {
    const app = buildServer();
    const { statusCode, error } = await queryLedgerExpectingError(app, "accountBalance", {});
    expect(statusCode).toBe(400);
    expect(error.data.code).toBe("BAD_REQUEST");
    await app.close();
  });
});

describe("ledger.subEnvelopeBalance", () => {
  it("returns the balance derived from store.getTransactions() for the reserved Spendable envelope", async () => {
    const app = buildServer();
    const data = await queryLedgerWithInput<number>(app, "subEnvelopeBalance", {
      subEnvelopeId: SPENDABLE_ENVELOPE_ID,
    });
    const expectedBalance = deriveSubEnvelopeBalance(await getTransactions(), SPENDABLE_ENVELOPE_ID);
    expect(data).toBe(expectedBalance);
    await app.close();
  });

  it("returns the balance derived from store.getTransactions() for a user-created sub-envelope", async () => {
    const app = buildServer();
    const data = await queryLedgerWithInput<number>(app, "subEnvelopeBalance", {
      subEnvelopeId: "sub-envelope-groceries-fund",
    });
    // Proves this isn't special-cased for the reserved Spendable singleton.
    const expectedBalance = deriveSubEnvelopeBalance(
      await getTransactions(),
      subEnvelopeIdFromString("sub-envelope-groceries-fund"),
    );
    expect(data).toBe(expectedBalance);
    await app.close();
  });

  it("returns NOT_FOUND (404) for a well-formed but nonexistent sub-envelope id", async () => {
    const app = buildServer();
    const { statusCode, error } = await queryLedgerExpectingError(app, "subEnvelopeBalance", {
      subEnvelopeId: "sub-envelope-does-not-exist",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns BAD_REQUEST (400) when subEnvelopeId is missing from the input", async () => {
    const app = buildServer();
    const { statusCode, error } = await queryLedgerExpectingError(app, "subEnvelopeBalance", {});
    expect(statusCode).toBe(400);
    expect(error.data.code).toBe("BAD_REQUEST");
    await app.close();
  });
});

// NOTE: ledger.addTransaction genuinely mutates the shared in-memory store
// (a singleton array, not reset per test — see store.ts's `transactions`).
// Tests below therefore never assert an absolute transaction count or
// absolute balance derived from the seed data; they read state immediately
// before/after their own mutation and assert on the delta or on the
// specific created record, so they're safe regardless of test order or how
// many other tests in this file/run already mutated the store.

describe("ledger.addTransaction — success", () => {
  it("creates a transaction and echoes back all fields, with amount parsed to signed centavos", async () => {
    const app = buildServer();
    const input = validAddTransactionInput({ description: "Groceries top-up", amount: "-150.00" });
    const data = await mutateLedger<AddedTransaction>(app, "addTransaction", input);

    expect(typeof data.id).toBe("string");
    expect(data.id.length).toBeGreaterThan(0);
    expect(data.date).toBe(input.date);
    expect(data.description).toBe(input.description);
    expect(data.categoryId).toBe(input.categoryId);
    expect(data.accountId).toBe(input.accountId);
    expect(data.subEnvelopeId).toBe(input.subEnvelopeId);
    expect(data.amount).toBe(-15000);
    expect(data.counterTransactionId).toBeNull();
    await app.close();
  });

  it("accepts categoryId: null", async () => {
    const app = buildServer();
    const input = validAddTransactionInput({ categoryId: null, description: "Uncategorized transfer" });
    const data = await mutateLedger<AddedTransaction>(app, "addTransaction", input);

    expect(data.categoryId).toBeNull();
    await app.close();
  });
});

describe("ledger.addTransaction — persistence and balance", () => {
  it("persists the new transaction, visible in a fresh ledger.transactions request", async () => {
    const app = buildServer();
    const input = validAddTransactionInput({ description: "Persistence probe" });
    const created = await mutateLedger<AddedTransaction>(app, "addTransaction", input);

    // A separate, later HTTP round-trip — not just reusing the mutation's
    // own return value — proves the store actually retained it.
    const allTransactions = await queryLedger<AddedTransaction[]>(app, "transactions");
    const found = allTransactions.find((transaction) => transaction.id === created.id);
    expect(found).toEqual(created);
    await app.close();
  });

  it("moves spendableBalance by exactly the parsed transaction amount", async () => {
    const app = buildServer();
    const input = validAddTransactionInput({ description: "Balance delta probe", amount: "-75.25" });

    const before = await queryLedger<number>(app, "spendableBalance");
    await mutateLedger<AddedTransaction>(app, "addTransaction", input);
    const after = await queryLedger<number>(app, "spendableBalance");

    expect(after - before).toBe(-7525);
    await app.close();
  });
});

describe("ledger.addTransaction — validation errors", () => {
  it("returns NOT_FOUND (404) for a well-formed but nonexistent accountId", async () => {
    const app = buildServer();
    const input = validAddTransactionInput({ accountId: "account-does-not-exist" });
    const { statusCode, error } = await mutateLedgerExpectingError(app, "addTransaction", input);
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns NOT_FOUND (404) for a well-formed but nonexistent subEnvelopeId", async () => {
    const app = buildServer();
    const input = validAddTransactionInput({ subEnvelopeId: "sub-envelope-does-not-exist" });
    const { statusCode, error } = await mutateLedgerExpectingError(app, "addTransaction", input);
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns NOT_FOUND (404) for a well-formed but nonexistent categoryId", async () => {
    const app = buildServer();
    const input = validAddTransactionInput({ categoryId: "category-does-not-exist" });
    const { statusCode, error } = await mutateLedgerExpectingError(app, "addTransaction", input);
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("rejects an empty description with a non-2xx response", async () => {
    const app = buildServer();
    const input = validAddTransactionInput({ description: "   " });
    const { statusCode } = await mutateLedgerExpectingError(app, "addTransaction", input);
    // createTransaction throws a plain Error (not a TRPCError), which tRPC
    // surfaces as INTERNAL_SERVER_ERROR/500 — confirmed against the running
    // server. Asserting non-2xx rather than the exact code, per the task.
    expect(statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });

  it("rejects a malformed amount string with a non-2xx response", async () => {
    const app = buildServer();
    const input = validAddTransactionInput({ amount: "not-a-number" });
    const { statusCode } = await mutateLedgerExpectingError(app, "addTransaction", input);
    // parseCents throws a plain Error, also surfaced as 500 — confirmed
    // against the running server. Asserting non-2xx, not the exact code.
    expect(statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });
});

// updateTransaction/deleteTransaction tests each create their own throwaway
// transaction via addTransaction first, rather than mutating one of the 5
// shared seed fixtures other tests in this file (and other test files run
// against the same testcontainers Postgres) might depend on — mirroring the
// isolation note above ledger.addTransaction's own tests.

async function addThrowawayTransaction(
  app: ReturnType<typeof buildServer>,
  overrides: Partial<AddTransactionInput> = {},
): Promise<AddedTransaction> {
  return mutateLedger<AddedTransaction>(
    app,
    "addTransaction",
    validAddTransactionInput({ description: "Throwaway fixture", ...overrides }),
  );
}

describe("ledger.updateTransaction — success", () => {
  it("updates only description, leaving every other field unchanged", async () => {
    const app = buildServer();
    const created = await addThrowawayTransaction(app, { description: "Original description" });

    const updated = await mutateLedger<AddedTransaction>(app, "updateTransaction", {
      id: created.id,
      description: "Updated description",
    });

    expect(updated.description).toBe("Updated description");
    expect(updated.date).toBe(created.date);
    expect(updated.categoryId).toBe(created.categoryId);
    expect(updated.accountId).toBe(created.accountId);
    expect(updated.subEnvelopeId).toBe(created.subEnvelopeId);
    expect(updated.amount).toBe(created.amount);
    expect(updated.id).toBe(created.id);
    expect(updated.counterTransactionId).toBeNull();
    await app.close();
  });

  it("persists the description update, visible in a fresh ledger.transactions request", async () => {
    const app = buildServer();
    const created = await addThrowawayTransaction(app, { description: "Original description" });

    await mutateLedger<AddedTransaction>(app, "updateTransaction", {
      id: created.id,
      description: "Persisted update",
    });

    const allTransactions = await queryLedger<AddedTransaction[]>(app, "transactions");
    const found = allTransactions.find((transaction) => transaction.id === created.id);
    expect(found?.description).toBe("Persisted update");
    await app.close();
  });
});

describe("ledger.updateTransaction — success, multiple/nullable/id fields", () => {
  it("updates multiple fields at once", async () => {
    const app = buildServer();
    const created = await addThrowawayTransaction(app, {
      description: "Original description",
      amount: "-10.00",
    });

    const updated = await mutateLedger<AddedTransaction>(app, "updateTransaction", {
      id: created.id,
      description: "Multi-field update",
      amount: "-25.50",
      date: "2026-08-20",
    });

    expect(updated.description).toBe("Multi-field update");
    expect(updated.amount).toBe(-2550);
    expect(updated.date).toBe("2026-08-20");
    expect(updated.accountId).toBe(created.accountId);
    expect(updated.subEnvelopeId).toBe(created.subEnvelopeId);
    expect(updated.categoryId).toBe(created.categoryId);
    await app.close();
  });

  it("updates categoryId to null, clearing it", async () => {
    const app = buildServer();
    const created = await addThrowawayTransaction(app, { categoryId: "category-groceries" });
    expect(created.categoryId).toBe("category-groceries");

    const updated = await mutateLedger<AddedTransaction>(app, "updateTransaction", {
      id: created.id,
      categoryId: null,
    });

    expect(updated.categoryId).toBeNull();
    await app.close();
  });

  it("updates accountId/subEnvelopeId to different valid seeded ids", async () => {
    const app = buildServer();
    const created = await addThrowawayTransaction(app, {
      accountId: "account-checking",
      subEnvelopeId: "spendable",
    });

    const updated = await mutateLedger<AddedTransaction>(app, "updateTransaction", {
      id: created.id,
      accountId: "account-savings",
      subEnvelopeId: "sub-envelope-groceries-fund",
    });

    expect(updated.accountId).toBe("account-savings");
    expect(updated.subEnvelopeId).toBe("sub-envelope-groceries-fund");
    await app.close();
  });

  it("is a no-op on other fields when given no update fields besides id", async () => {
    const app = buildServer();
    const created = await addThrowawayTransaction(app);

    const updated = await mutateLedger<AddedTransaction>(app, "updateTransaction", {
      id: created.id,
    });

    expect(updated).toEqual(created);
    await app.close();
  });
});

describe("ledger.updateTransaction — validation errors", () => {
  it("returns NOT_FOUND (404) for a nonexistent transaction id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateLedgerExpectingError(app, "updateTransaction", {
      id: "txn-does-not-exist",
      description: "Whatever",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns NOT_FOUND (404) for a well-formed but nonexistent accountId", async () => {
    const app = buildServer();
    const created = await addThrowawayTransaction(app);

    const { statusCode, error } = await mutateLedgerExpectingError(app, "updateTransaction", {
      id: created.id,
      accountId: "account-does-not-exist",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns NOT_FOUND (404) for a well-formed but nonexistent subEnvelopeId", async () => {
    const app = buildServer();
    const created = await addThrowawayTransaction(app);

    const { statusCode, error } = await mutateLedgerExpectingError(app, "updateTransaction", {
      id: created.id,
      subEnvelopeId: "sub-envelope-does-not-exist",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns NOT_FOUND (404) for a well-formed but nonexistent categoryId", async () => {
    const app = buildServer();
    const created = await addThrowawayTransaction(app);

    const { statusCode, error } = await mutateLedgerExpectingError(app, "updateTransaction", {
      id: created.id,
      categoryId: "category-does-not-exist",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for an empty/whitespace-only description, and does not persist it", async () => {
    const app = buildServer();
    const created = await addThrowawayTransaction(app, { description: "Untouched description" });

    const { statusCode, error } = await mutateLedgerExpectingError(app, "updateTransaction", {
      id: created.id,
      description: "   ",
    });
    // updateTransaction throws a plain Error (not a TRPCError), which tRPC
    // surfaces as INTERNAL_SERVER_ERROR/500 — same convention as
    // addTransaction's own empty-description test and
    // reference.test.ts's updateAccount/updateCategory error tests.
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allTransactions = await queryLedger<AddedTransaction[]>(app, "transactions");
    const found = allTransactions.find((transaction) => transaction.id === created.id);
    expect(found?.description).toBe("Untouched description");
    await app.close();
  });
});

describe("ledger.deleteTransaction — success", () => {
  it("deletes the transaction, no longer appearing in a fresh ledger.transactions request", async () => {
    const app = buildServer();
    const created = await addThrowawayTransaction(app);

    const deleteResult = await mutateLedger<{ id: string }>(app, "deleteTransaction", {
      id: created.id,
    });
    expect(deleteResult.id).toBe(created.id);

    const allTransactions = await queryLedger<AddedTransaction[]>(app, "transactions");
    const found = allTransactions.find((transaction) => transaction.id === created.id);
    expect(found).toBeUndefined();
    await app.close();
  });

  it("moves spendableBalance by exactly the negated amount of the deleted transaction", async () => {
    const app = buildServer();
    const created = await addThrowawayTransaction(app, { amount: "-42.00" });

    const before = await queryLedger<number>(app, "spendableBalance");
    await mutateLedger<{ id: string }>(app, "deleteTransaction", { id: created.id });
    const after = await queryLedger<number>(app, "spendableBalance");

    expect(after - before).toBe(4200);
    await app.close();
  });
});

describe("ledger.deleteTransaction — validation errors", () => {
  it("returns NOT_FOUND (404) for a nonexistent transaction id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateLedgerExpectingError(app, "deleteTransaction", {
      id: "txn-does-not-exist",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });
});
