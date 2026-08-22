import { describe, expect, it } from "vitest";

import { buildServer } from "../index";

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

/**
 * Builds the tRPC v11 GET query URL for a parameterized procedure: input is
 * a URL-encoded JSON query parameter (`?input=<encodeURIComponent(JSON)>`) —
 * same convention as `ledger.test.ts`'s `ledgerQueryUrl`.
 */
function reportingQueryUrl(procedure: string, input: unknown): string {
  return `/trpc/reporting.${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`;
}

/**
 * Like `ledger.test.ts`'s `queryLedgerWithInput`, adapted for the
 * `reporting` router: asserts 200 and returns the decoded result data.
 */
async function queryReportingWithInput<T>(
  app: ReturnType<typeof buildServer>,
  procedure: string,
  input: unknown,
): Promise<T> {
  const response = await app.inject({
    method: "GET",
    url: reportingQueryUrl(procedure, input),
  });
  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body) as TrpcQueryResponse<T>;
  return body.result.data;
}

/**
 * Like `ledger.test.ts`'s `queryLedgerExpectingError`: doesn't assert a 200
 * status up front, just returns the raw HTTP status and the decoded tRPC
 * error envelope so the caller can assert on both — used for the Zod
 * input-validation failure cases below.
 */
async function queryReportingExpectingError(
  app: ReturnType<typeof buildServer>,
  procedure: string,
  input: unknown,
): Promise<{ statusCode: number; error: TrpcErrorResponse["error"] }> {
  const response = await app.inject({
    method: "GET",
    url: reportingQueryUrl(procedure, input),
  });
  const body = JSON.parse(response.body) as TrpcErrorResponse;
  return { statusCode: response.statusCode, error: body.error };
}

interface CategorySpendingEntry {
  categoryId: string;
  total: number;
}

interface CategorySpendingReport {
  period: { year: number; month: number };
  spendingByCategory: CategorySpendingEntry[];
  incomeTotal: number;
}

// NOTE: reporting.categorySpending is read-only and never itself mutates the
// shared in-memory store, but other test files in this suite (e.g.
// budget.test.ts, ledger.test.ts) do mutate it via their own mutation
// procedures. All the seeded transactions used below fall in August 2026;
// any mutation tests elsewhere either target a different month (2026-08-15
// is within range, so watch for that — see the comment on the August test)
// or a category/date that doesn't collide with the specific totals asserted
// here. The values asserted are exactly the ones independently hand-computed
// from store.ts's seed data, matching what the orchestrator's own curl check
// against the running dev server found.

describe("reporting.categorySpending", () => {
  it("returns spending-by-category and income totals matching the seeded August 2026 data", async () => {
    const app = buildServer();
    const data = await queryReportingWithInput<CategorySpendingReport>(app, "categorySpending", {
      year: 2026,
      month: 8,
    });

    expect(data.period).toEqual({ year: 2026, month: 8 });

    // Hand-computed from store.ts's seeded August 2026 transactions:
    //   txn-salary                    +5,000,000  category-income
    //   txn-groceries-1                 -120,050  category-groceries
    //   txn-transport-1                   -5,000  category-transport
    //   txn-groceries-2                  -84,000  category-groceries
    //   txn-groceries-fund-allocation   +300,000  categoryId: null (excluded)
    // groceries total: -120050 + -84000 = -204050
    // transport total: -5000
    // income total: 5000000
    const groceries = data.spendingByCategory.find(
      (entry) => entry.categoryId === "category-groceries",
    );
    const transport = data.spendingByCategory.find(
      (entry) => entry.categoryId === "category-transport",
    );
    expect(groceries?.total).toBe(-204050);
    expect(transport?.total).toBe(-5000);
    expect(data.incomeTotal).toBe(5000000);

    // Other test files may mutate the store with additional August
    // transactions (e.g. budget.test.ts's applyBudgetLine seeded for
    // 2026-08-15, but those credit sub-envelopes with categoryId: null, so
    // they don't add entries here) — assert on the two known categories'
    // presence/values above rather than the exact length of
    // spendingByCategory or an exhaustive category list.
    expect(data.spendingByCategory.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });

  it("returns an empty report (not an error) for a year/month with no seeded transactions", async () => {
    const app = buildServer();
    const data = await queryReportingWithInput<CategorySpendingReport>(app, "categorySpending", {
      year: 2026,
      month: 1,
    });

    expect(data.period).toEqual({ year: 2026, month: 1 });
    expect(data.spendingByCategory).toEqual([]);
    expect(data.incomeTotal).toBe(0);
    await app.close();
  });
});

describe("reporting.categorySpending — input validation", () => {
  it("returns BAD_REQUEST (400) for an out-of-range month (13)", async () => {
    const app = buildServer();
    const { statusCode, error } = await queryReportingExpectingError(app, "categorySpending", {
      year: 2026,
      month: 13,
    });
    expect(statusCode).toBe(400);
    expect(error.data.code).toBe("BAD_REQUEST");
    await app.close();
  });

  it("returns BAD_REQUEST (400) for an out-of-range month (0)", async () => {
    const app = buildServer();
    const { statusCode, error } = await queryReportingExpectingError(app, "categorySpending", {
      year: 2026,
      month: 0,
    });
    expect(statusCode).toBe(400);
    expect(error.data.code).toBe("BAD_REQUEST");
    await app.close();
  });

  it("returns BAD_REQUEST (400) when year/month are missing from the input", async () => {
    const app = buildServer();
    const { statusCode, error } = await queryReportingExpectingError(app, "categorySpending", {});
    expect(statusCode).toBe(400);
    expect(error.data.code).toBe("BAD_REQUEST");
    await app.close();
  });
});
