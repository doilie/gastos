import { describe, expect, it } from "vitest";

import { buildServer } from "../index";
import { getBudgetLines, getPaydaySchedules } from "../store";

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

async function queryBudget<T>(app: ReturnType<typeof buildServer>, procedure: string): Promise<T> {
  const response = await app.inject({
    method: "GET",
    url: `/trpc/budget.${procedure}`,
  });
  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body) as TrpcQueryResponse<T>;
  return body.result.data;
}

/**
 * tRPC v11 mutations go over POST with the raw input as the JSON body (no
 * `{ input: ... }` wrapper) — same pattern established in `ledger.test.ts`'s
 * `mutateLedger` helper, adapted here for the `budget` router.
 */
async function mutateBudget<T>(
  app: ReturnType<typeof buildServer>,
  procedure: string,
  input: object,
): Promise<T> {
  const response = await app.inject({
    method: "POST",
    url: `/trpc/budget.${procedure}`,
    payload: input,
  });
  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body) as TrpcQueryResponse<T>;
  return body.result.data;
}

/**
 * Like `mutateBudget`, but for error-path tests: doesn't assert a 200 status
 * up front, just returns the raw HTTP status and the decoded tRPC error
 * envelope so the caller can assert on both — mirrors
 * `ledger.test.ts`'s `mutateLedgerExpectingError`.
 */
async function mutateBudgetExpectingError(
  app: ReturnType<typeof buildServer>,
  procedure: string,
  input: object,
): Promise<{ statusCode: number; error: TrpcErrorResponse["error"] }> {
  const response = await app.inject({
    method: "POST",
    url: `/trpc/budget.${procedure}`,
    payload: input,
  });
  const body = JSON.parse(response.body) as TrpcErrorResponse;
  return { statusCode: response.statusCode, error: body.error };
}

/**
 * Like `queryBudget`, but for a query on a different router (`ledger`),
 * needed to prove persistence/balance-delta across routers without
 * redefining the `ledger` router's own test helpers here.
 */
async function queryLedger<T>(app: ReturnType<typeof buildServer>, procedure: string): Promise<T> {
  const response = await app.inject({
    method: "GET",
    url: `/trpc/ledger.${procedure}`,
  });
  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body) as TrpcQueryResponse<T>;
  return body.result.data;
}

async function queryLedgerWithInput<T>(
  app: ReturnType<typeof buildServer>,
  procedure: string,
  input: unknown,
): Promise<T> {
  const response = await app.inject({
    method: "GET",
    url: `/trpc/ledger.${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`,
  });
  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body) as TrpcQueryResponse<T>;
  return body.result.data;
}

interface AppliedTransaction {
  id: string;
  date: string;
  description: string;
  categoryId: string | null;
  accountId: string;
  subEnvelopeId: string;
  counterTransactionId: string | null;
  amount: number;
}

describe("budget router", () => {
  it("budget.paydaySchedules returns exactly what store.getPaydaySchedules() returns", async () => {
    const app = buildServer();
    const data = await queryBudget(app, "paydaySchedules");
    expect(data).toEqual(getPaydaySchedules());
    await app.close();
  });

  it("budget.budgetLines returns exactly what store.getBudgetLines() returns", async () => {
    const app = buildServer();
    const data = await queryBudget(app, "budgetLines");
    expect(data).toEqual(getBudgetLines());
    await app.close();
  });
});

// NOTE: budget.applyBudgetLine genuinely mutates the shared in-memory store
// (a singleton array, same as ledger.addTransaction — see store.ts's
// `transactions`). Tests below therefore never assert an absolute balance
// derived from the seed data; they read state immediately before/after their
// own mutation and assert on the delta or on the specific created record, so
// they're safe regardless of test order or how many other tests in this
// file/run already mutated the store.

describe("budget.applyBudgetLine — success", () => {
  it("creates a transaction crediting the target sub-envelope, with the amount NOT negated", async () => {
    const app = buildServer();
    const data = await mutateBudget<AppliedTransaction>(app, "applyBudgetLine", {
      budgetLineId: "budget-line-groceries-fund-august-15",
      accountId: "account-savings",
    });

    expect(typeof data.id).toBe("string");
    expect(data.id.length).toBeGreaterThan(0);
    expect(data.date).toBe("2026-08-15");
    expect(data.description).toBe("Payday allocation — Groceries Fund");
    expect(data.categoryId).toBeNull();
    expect(data.accountId).toBe("account-savings");
    expect(data.subEnvelopeId).toBe("sub-envelope-groceries-fund");
    // Key sign-convention check: BudgetLine allocations credit the envelope,
    // so the amount must be positive/unnegated, unlike a card-purchase debit.
    expect(data.amount).toBe(500000);
    expect(data.amount).not.toBe(-500000);
    expect(data.counterTransactionId).toBeNull();
    await app.close();
  });
});

describe("budget.applyBudgetLine — persistence and balance", () => {
  it("persists the new transaction, visible in a fresh ledger.transactions request", async () => {
    const app = buildServer();
    const created = await mutateBudget<AppliedTransaction>(app, "applyBudgetLine", {
      budgetLineId: "budget-line-groceries-fund-august-15",
      accountId: "account-savings",
    });

    // A separate, later HTTP round-trip against a different router — not
    // just reusing the mutation's own return value — proves the store
    // actually retained it.
    const allTransactions = await queryLedger<AppliedTransaction[]>(app, "transactions");
    const found = allTransactions.find((transaction) => transaction.id === created.id);
    expect(found).toEqual(created);
    await app.close();
  });

  it("moves sub-envelope-groceries-fund's balance by exactly the budget line's amount", async () => {
    const app = buildServer();

    const before = await queryLedgerWithInput<number>(app, "subEnvelopeBalance", {
      subEnvelopeId: "sub-envelope-groceries-fund",
    });
    await mutateBudget<AppliedTransaction>(app, "applyBudgetLine", {
      budgetLineId: "budget-line-groceries-fund-august-15",
      accountId: "account-savings",
    });
    const after = await queryLedgerWithInput<number>(app, "subEnvelopeBalance", {
      subEnvelopeId: "sub-envelope-groceries-fund",
    });

    expect(after - before).toBe(500000);
    await app.close();
  });
});

describe("budget.applyBudgetLine — validation errors", () => {
  it("returns NOT_FOUND (404) for a well-formed but nonexistent budgetLineId", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateBudgetExpectingError(app, "applyBudgetLine", {
      budgetLineId: "budget-line-does-not-exist",
      accountId: "account-savings",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns NOT_FOUND (404) for a well-formed but nonexistent accountId", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateBudgetExpectingError(app, "applyBudgetLine", {
      budgetLineId: "budget-line-groceries-fund-august-15",
      accountId: "account-does-not-exist",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("propagates the domain-layer error with a non-2xx response when accountId is real but not linked to the target sub-envelope", async () => {
    const app = buildServer();
    // account-checking exists but is only linked to the Spendable envelope,
    // not sub-envelope-groceries-fund (which is linked to account-savings
    // only per the seed data) — the underlying applyBudgetLine domain
    // function throws a plain Error for this, surfaced by tRPC as
    // INTERNAL_SERVER_ERROR/500, same pattern as ledger.addTransaction's
    // validation-failure cases. Asserting non-2xx, not the exact code.
    const { statusCode } = await mutateBudgetExpectingError(app, "applyBudgetLine", {
      budgetLineId: "budget-line-groceries-fund-august-15",
      accountId: "account-checking",
    });
    expect(statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });
});

interface AppliedBudgetLinesResult {
  appliedTransactions: AppliedTransaction[];
  skippedLines: unknown[];
}

// NOTE: same shared-store discipline as budget.applyBudgetLine above —
// budget.applyBudgetLines also mutates the shared in-memory `transactions`
// array, so these tests never assume a pristine baseline either.

describe("budget.applyBudgetLines — success", () => {
  it("applies only the requested line (partial batch), reporting the other seeded line as skipped", async () => {
    const app = buildServer();
    const data = await mutateBudget<AppliedBudgetLinesResult>(app, "applyBudgetLines", {
      applications: [{ budgetLineId: "budget-line-groceries-fund-august-15", accountId: "account-savings" }],
    });

    expect(data.appliedTransactions).toHaveLength(1);
    const applied = data.appliedTransactions[0];
    expect(applied).toBeDefined();
    expect(applied?.amount).toBe(500000);
    expect(applied?.accountId).toBe("account-savings");
    expect(applied?.subEnvelopeId).toBe("sub-envelope-groceries-fund");
    expect(applied?.categoryId).toBeNull();
    expect(applied?.counterTransactionId).toBeNull();

    expect(data.skippedLines).toHaveLength(1);
    const [skipped] = getBudgetLines().filter(
      (line) => line.id === "budget-line-spendable-august-15",
    );
    expect(data.skippedLines[0]).toEqual(skipped);
    await app.close();
  });

  it("applies both seeded lines when both are requested (full batch), skippedLines is empty", async () => {
    const app = buildServer();
    const data = await mutateBudget<AppliedBudgetLinesResult>(app, "applyBudgetLines", {
      applications: [
        { budgetLineId: "budget-line-groceries-fund-august-15", accountId: "account-savings" },
        { budgetLineId: "budget-line-spendable-august-15", accountId: "account-checking" },
      ],
    });

    expect(data.appliedTransactions).toHaveLength(2);
    expect(data.skippedLines).toHaveLength(0);

    const groceries = data.appliedTransactions.find(
      (transaction) => transaction.subEnvelopeId === "sub-envelope-groceries-fund",
    );
    const spendable = data.appliedTransactions.find(
      (transaction) => transaction.subEnvelopeId === "spendable",
    );
    expect(groceries?.amount).toBe(500000);
    expect(groceries?.accountId).toBe("account-savings");
    expect(spendable?.amount).toBe(2000000);
    expect(spendable?.accountId).toBe("account-checking");
    await app.close();
  });

  it("with an empty applications list, applies nothing and skips every seeded line", async () => {
    const app = buildServer();
    const data = await mutateBudget<AppliedBudgetLinesResult>(app, "applyBudgetLines", {
      applications: [],
    });

    expect(data.appliedTransactions).toHaveLength(0);
    expect(data.skippedLines).toHaveLength(getBudgetLines().length);
    const skippedIds = data.skippedLines.map((line) => (line as { id: string }).id);
    for (const line of getBudgetLines()) {
      expect(skippedIds).toContain(line.id);
    }
    await app.close();
  });
});

describe("budget.applyBudgetLines — persistence", () => {
  it("persists the applied transaction, visible in a fresh ledger.transactions request", async () => {
    const app = buildServer();
    const data = await mutateBudget<AppliedBudgetLinesResult>(app, "applyBudgetLines", {
      applications: [{ budgetLineId: "budget-line-groceries-fund-august-15", accountId: "account-savings" }],
    });
    const created = data.appliedTransactions[0];
    expect(created).toBeDefined();

    const allTransactions = await queryLedger<AppliedTransaction[]>(app, "transactions");
    const found = allTransactions.find((transaction) => transaction.id === created?.id);
    expect(found).toEqual(created);
    await app.close();
  });
});

describe("budget.applyBudgetLines — validation errors", () => {
  it("returns NOT_FOUND (404) when the applications list contains a nonexistent budgetLineId", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateBudgetExpectingError(app, "applyBudgetLines", {
      applications: [{ budgetLineId: "budget-line-does-not-exist", accountId: "account-savings" }],
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns NOT_FOUND (404) when the applications list contains a nonexistent accountId", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateBudgetExpectingError(app, "applyBudgetLines", {
      applications: [
        { budgetLineId: "budget-line-groceries-fund-august-15", accountId: "account-does-not-exist" },
      ],
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("propagates the domain-layer error with a non-2xx response when accountId is real but not linked to the target sub-envelope", async () => {
    const app = buildServer();
    // Same mismatch as the single-item mutation's equivalent test:
    // account-checking is only linked to the Spendable envelope, not
    // sub-envelope-groceries-fund.
    const { statusCode } = await mutateBudgetExpectingError(app, "applyBudgetLines", {
      applications: [
        { budgetLineId: "budget-line-groceries-fund-august-15", accountId: "account-checking" },
      ],
    });
    expect(statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });
});
