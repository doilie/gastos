import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// This router validates budget-line account/sub-envelope ids against
// Postgres-backed Reference-layer tables at handler-call time, so this file
// needs its own ephemeral, migrated, seeded testcontainers Postgres before
// importing `buildServer`, per the gastos-coder-documented conversion
// recipe. getBudgetLines/getPaydaySchedules are now also Postgres-backed
// (async), and still come from the same dynamically-imported `../store`
// module since it can't be statically imported before DATABASE_URL is set.
let container: StartedPostgreSqlContainer;
let buildServer: typeof import("../index").buildServer;
let getBudgetLines: typeof import("../store").getBudgetLines;
let getPaydaySchedules: typeof import("../store").getPaydaySchedules;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  process.env["DATABASE_URL"] = container.getConnectionUri();

  const dbModule = await import("../db");
  await dbModule.runMigrations(dbModule.db);
  await dbModule.seedReferenceData(dbModule.db);
  await dbModule.seedRemainingFixtureData(dbModule.db);

  ({ buildServer } = await import("../index"));
  ({ getBudgetLines, getPaydaySchedules } = await import("../store"));
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
    expect(data).toEqual(await getPaydaySchedules());
    await app.close();
  });

  it("budget.budgetLines returns exactly what store.getBudgetLines() returns", async () => {
    const app = buildServer();
    const data = await queryBudget(app, "budgetLines");
    expect(data).toEqual(await getBudgetLines());
    await app.close();
  });
});

// NOTE ON FIXTURE SCARCITY: budget.applyBudgetLine/applyBudgetLines genuinely
// mutate the shared store (the same real, testcontainers-backed Postgres this
// whole file shares), AND, since the isApplied fix, a seeded BudgetLine can
// only ever be *successfully* applied ONCE for the lifetime of the store —
// re-applying now correctly rejects. `budget.createBudgetLine` exists (see
// the dedicated "budget.createBudgetLine" describe blocks at the end of this
// file, placed there deliberately — any line they create would otherwise
// inflate the hardcoded skippedLines count the final
// "applyBudgetLines — success" test below asserts), but every test in the
// describe blocks immediately below still targets the two ORIGINAL seeded
// fixtures, so this file has exactly two real BudgetLine fixtures for the
// entire apply-lifecycle portion of its run
// ("budget-line-groceries-fund-august-15" and
// "budget-line-spendable-august-15"). The describe blocks below are ordered
// and budgeted deliberately:
//   - "budget-line-groceries-fund-august-15" is successfully applied exactly
//     once, in the "single line lifecycle" block immediately below.
//   - "budget-line-spendable-august-15" is deliberately kept UN-applied
//     through every validation-error test (mismatch/NOT_FOUND never succeed,
//     so they never consume it), and is successfully applied exactly once,
//     last, in the final batch-success test — which also proves the
//     already-applied groceries-fund line gets auto-skipped by the batch path
//     even when explicitly included in `applications`.
// Tests that must prove a *rejection* reuse already-applied state produced by
// an earlier test in the SAME describe block (documented inline); tests that
// must prove a genuine mismatch/success always target the fixture still known
// to be un-applied at that point in the file's declaration order.

describe("budget.applyBudgetLine — single line lifecycle (budget-line-groceries-fund-august-15)", () => {
  const budgetLineId = "budget-line-groceries-fund-august-15";
  const accountId = "account-savings";

  it("creates a transaction crediting the target sub-envelope, persists it, and moves the balance by exactly the line's amount", async () => {
    const app = buildServer();
    const before = await queryLedgerWithInput<number>(app, "subEnvelopeBalance", {
      subEnvelopeId: "sub-envelope-groceries-fund",
    });

    const data = await mutateBudget<AppliedTransaction>(app, "applyBudgetLine", {
      budgetLineId,
      accountId,
    });

    expect(typeof data.id).toBe("string");
    expect(data.id.length).toBeGreaterThan(0);
    expect(data.date).toBe("2026-08-15");
    expect(data.description).toBe("Payday allocation — Groceries Fund");
    expect(data.categoryId).toBeNull();
    expect(data.accountId).toBe(accountId);
    expect(data.subEnvelopeId).toBe("sub-envelope-groceries-fund");
    // Key sign-convention check: BudgetLine allocations credit the envelope,
    // so the amount must be positive/unnegated, unlike a card-purchase debit.
    expect(data.amount).toBe(500000);
    expect(data.amount).not.toBe(-500000);
    expect(data.counterTransactionId).toBeNull();

    const allTransactions = await queryLedger<AppliedTransaction[]>(app, "transactions");
    expect(allTransactions.find((transaction) => transaction.id === data.id)).toEqual(data);

    const after = await queryLedgerWithInput<number>(app, "subEnvelopeBalance", {
      subEnvelopeId: "sub-envelope-groceries-fund",
    });
    expect(after - before).toBe(500000);
    await app.close();
  });

  it("is reflected as isApplied: true via budget.budgetLines, while the not-yet-applied spendable line still reads isApplied: false", async () => {
    const app = buildServer();
    const lines = await queryBudget<{ id: string; isApplied: boolean }[]>(app, "budgetLines");
    const groceries = lines.find((line) => line.id === budgetLineId);
    const spendable = lines.find((line) => line.id === "budget-line-spendable-august-15");
    expect(groceries?.isApplied).toBe(true);
    expect(spendable?.isApplied).toBe(false);
    await app.close();
  });

  it("rejects re-applying the same line with a non-2xx response, without creating a duplicate transaction", async () => {
    const app = buildServer();
    const { statusCode } = await mutateBudgetExpectingError(app, "applyBudgetLine", {
      budgetLineId,
      accountId,
    });
    expect(statusCode).toBeGreaterThanOrEqual(400);

    const allTransactions = await queryLedger<AppliedTransaction[]>(app, "transactions");
    const matches = allTransactions.filter(
      (transaction) => transaction.description === "Payday allocation — Groceries Fund",
    );
    expect(matches).toHaveLength(1);
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
      budgetLineId: "budget-line-spendable-august-15",
      accountId: "account-does-not-exist",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("propagates the domain-layer error with a non-2xx response when accountId is real but not linked to the target sub-envelope", async () => {
    const app = buildServer();
    // budget-line-spendable-august-15 targets the Spendable envelope, which
    // is linked ONLY to account-checking (see store.ts) — account-savings is
    // a real account but not one of Spendable's linked accounts. This line is
    // deliberately never successfully applied anywhere earlier in this file
    // (unlike the groceries-fund line above), so this genuinely exercises the
    // account-mismatch rejection rather than colliding with the
    // already-applied rejection — the bug the previous version of this test
    // actually had.
    const { statusCode } = await mutateBudgetExpectingError(app, "applyBudgetLine", {
      budgetLineId: "budget-line-spendable-august-15",
      accountId: "account-savings",
    });
    expect(statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });
});

interface AppliedBudgetLinesResult {
  appliedTransactions: AppliedTransaction[];
  skippedLines: unknown[];
}

describe("budget.applyBudgetLines — empty/no-op batch", () => {
  it("with an empty applications list, applies nothing and skips every seeded line", async () => {
    const app = buildServer();
    const data = await mutateBudget<AppliedBudgetLinesResult>(app, "applyBudgetLines", {
      applications: [],
    });

    const seededLines = await getBudgetLines();
    expect(data.appliedTransactions).toHaveLength(0);
    expect(data.skippedLines).toHaveLength(seededLines.length);
    const skippedIds = data.skippedLines.map((line) => (line as { id: string }).id);
    for (const line of seededLines) {
      expect(skippedIds).toContain(line.id);
    }
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
        { budgetLineId: "budget-line-spendable-august-15", accountId: "account-does-not-exist" },
      ],
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("propagates the domain-layer error with a non-2xx response when accountId is real but not linked to the target sub-envelope", async () => {
    const app = buildServer();
    // Same mismatch as the single-item mutation's equivalent test above:
    // budget-line-spendable-august-15 + account-savings (not one of
    // Spendable's linked accounts). This line stays un-applied throughout
    // this describe block — the batch-success test below (which legitimately
    // applies it) is declared, and therefore runs, after this one.
    const { statusCode } = await mutateBudgetExpectingError(app, "applyBudgetLines", {
      applications: [
        { budgetLineId: "budget-line-spendable-august-15", accountId: "account-savings" },
      ],
    });
    expect(statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });
});

describe("budget.applyBudgetLines — success and already-applied auto-skip", () => {
  it("applies the still-unapplied spendable line while auto-skipping the already-applied groceries-fund line (no duplicate transaction), and persists the result", async () => {
    const app = buildServer();
    const data = await mutateBudget<AppliedBudgetLinesResult>(app, "applyBudgetLines", {
      applications: [
        { budgetLineId: "budget-line-groceries-fund-august-15", accountId: "account-savings" },
        { budgetLineId: "budget-line-spendable-august-15", accountId: "account-checking" },
      ],
    });

    // budget-line-groceries-fund-august-15 was already applied by an earlier
    // describe block in this file. applyBudgetLines auto-skips an
    // already-applied line WITHOUT even calling the resolver, so it must land
    // in skippedLines here even though it was explicitly included in
    // `applications` — the resolver was never asked to resolve it, and no
    // second transaction is produced for it.
    expect(data.appliedTransactions).toHaveLength(1);
    const applied = data.appliedTransactions[0];
    expect(applied?.subEnvelopeId).toBe("spendable");
    expect(applied?.accountId).toBe("account-checking");
    expect(applied?.amount).toBe(2000000);
    expect(applied?.categoryId).toBeNull();
    expect(applied?.counterTransactionId).toBeNull();

    expect(data.skippedLines).toHaveLength(1);
    expect((data.skippedLines[0] as { id: string }).id).toBe(
      "budget-line-groceries-fund-august-15",
    );

    const allTransactions = await queryLedger<AppliedTransaction[]>(app, "transactions");
    const groceriesTransactions = allTransactions.filter(
      (transaction) => transaction.description === "Payday allocation — Groceries Fund",
    );
    const spendableTransactions = allTransactions.filter(
      (transaction) => transaction.description === "Payday allocation — Spendable",
    );
    expect(groceriesTransactions).toHaveLength(1);
    expect(spendableTransactions).toHaveLength(1);
    expect(spendableTransactions[0]?.id).toBe(applied?.id);
    await app.close();
  });
});

// The create-mutation tests below are placed deliberately AFTER every
// apply-lifecycle describe block above: budget.applyBudgetLines re-fetches
// every seeded BudgetLine and reports whichever ones aren't in its
// `applications` list as skipped, so any line created before those tests run
// would inflate their hardcoded skippedLines-count assertions (see the NOTE
// ON FIXTURE SCARCITY comment above). Nothing below this point creates a
// BudgetLine that any earlier test could observe.

interface CreatedPaydaySchedule {
  id: string;
  name: string;
  paydayDaysOfMonth: number[];
}

describe("budget.createPaydaySchedule — success", () => {
  it("creates a payday schedule, round-tripping name/paydayDaysOfMonth", async () => {
    const app = buildServer();
    const data = await mutateBudget<CreatedPaydaySchedule>(app, "createPaydaySchedule", {
      name: "Monthly",
      paydayDaysOfMonth: [1],
    });

    expect(typeof data.id).toBe("string");
    expect(data.id.length).toBeGreaterThan(0);
    expect(data.name).toBe("Monthly");
    expect(data.paydayDaysOfMonth).toEqual([1]);
    await app.close();
  });

  it("persists the created schedule, visible in a fresh budget.paydaySchedules request", async () => {
    const app = buildServer();
    const created = await mutateBudget<CreatedPaydaySchedule>(app, "createPaydaySchedule", {
      name: "Persisted schedule",
      paydayDaysOfMonth: [10, 25],
    });

    const schedules = await queryBudget<CreatedPaydaySchedule[]>(app, "paydaySchedules");
    expect(schedules.find((schedule) => schedule.id === created.id)).toEqual(created);
    await app.close();
  });
});

describe("budget.createPaydaySchedule — domain validation errors (unwrapped Error, surfaces as 500)", () => {
  it("rejects an empty/whitespace-only name", async () => {
    const app = buildServer();
    const { statusCode } = await mutateBudgetExpectingError(app, "createPaydaySchedule", {
      name: "   ",
      paydayDaysOfMonth: [1],
    });
    expect(statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });

  it("rejects an out-of-range payday day", async () => {
    const app = buildServer();
    const { statusCode } = await mutateBudgetExpectingError(app, "createPaydaySchedule", {
      name: "Bad day",
      paydayDaysOfMonth: [32],
    });
    expect(statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });
});

interface CreatedBudgetLine {
  id: string;
  budgetPeriod: { year: number; month: number };
  paydayDate: string;
  subEnvelopeId: string;
  amount: number;
  description: string;
  isApplied: boolean;
}

describe("budget.createBudgetLine — success", () => {
  it("creates a budget line, deriving budgetPeriod from paydayDate, with isApplied false", async () => {
    const app = buildServer();
    const data = await mutateBudget<CreatedBudgetLine>(app, "createBudgetLine", {
      paydayDate: "2026-09-15",
      subEnvelopeId: "sub-envelope-groceries-fund",
      amount: "300.00",
      description: "September groceries",
    });

    expect(typeof data.id).toBe("string");
    expect(data.id.length).toBeGreaterThan(0);
    expect(data.budgetPeriod).toEqual({ year: 2026, month: 9 });
    expect(data.paydayDate).toBe("2026-09-15");
    expect(data.subEnvelopeId).toBe("sub-envelope-groceries-fund");
    expect(data.amount).toBe(30000);
    expect(data.description).toBe("September groceries");
    expect(data.isApplied).toBe(false);
    await app.close();
  });

  it("persists the created line, visible in a fresh budget.budgetLines request", async () => {
    const app = buildServer();
    const created = await mutateBudget<CreatedBudgetLine>(app, "createBudgetLine", {
      paydayDate: "2026-09-30",
      subEnvelopeId: "sub-envelope-groceries-fund",
      amount: "50.00",
      description: "Persisted line",
    });

    const lines = await queryBudget<CreatedBudgetLine[]>(app, "budgetLines");
    expect(lines.find((line) => line.id === created.id)).toEqual(created);
    await app.close();
  });
});

describe("budget.createBudgetLine — NOT_FOUND validation error", () => {
  it("returns NOT_FOUND (404) for a well-formed but nonexistent subEnvelopeId", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateBudgetExpectingError(app, "createBudgetLine", {
      paydayDate: "2026-09-15",
      subEnvelopeId: "sub-envelope-does-not-exist",
      amount: "50.00",
      description: "Nope",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });
});

describe("budget.createBudgetLine — domain validation errors (unwrapped Error, surfaces as 500)", () => {
  it("rejects an empty/whitespace-only description", async () => {
    const app = buildServer();
    const { statusCode } = await mutateBudgetExpectingError(app, "createBudgetLine", {
      paydayDate: "2026-09-15",
      subEnvelopeId: "sub-envelope-groceries-fund",
      amount: "50.00",
      description: "   ",
    });
    expect(statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });

  it("rejects a zero amount", async () => {
    const app = buildServer();
    const { statusCode } = await mutateBudgetExpectingError(app, "createBudgetLine", {
      paydayDate: "2026-09-15",
      subEnvelopeId: "sub-envelope-groceries-fund",
      amount: "0.00",
      description: "Zero amount",
    });
    expect(statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });
});

// The update-mutation tests below each create their own fresh
// PaydaySchedule/BudgetLine fixture via the create mutation rather than
// reusing any seeded or earlier-created one — this sidesteps the exact same
// fixture-scarcity concern documented above (an update target must not
// already be applied, and must not be shared with a test elsewhere in this
// file that asserts an exact count/state against it).

describe("budget.updatePaydaySchedule — success", () => {
  it("applies a partial update, round-tripping the new fields, leaving id unchanged", async () => {
    const app = buildServer();
    const created = await mutateBudget<CreatedPaydaySchedule>(app, "createPaydaySchedule", {
      name: "Original schedule",
      paydayDaysOfMonth: [1],
    });

    const updated = await mutateBudget<CreatedPaydaySchedule>(app, "updatePaydaySchedule", {
      id: created.id,
      name: "Renamed schedule",
      paydayDaysOfMonth: [10, 20],
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("Renamed schedule");
    expect(updated.paydayDaysOfMonth).toEqual([10, 20]);
    await app.close();
  });

  it("leaves an unspecified field untouched, and persists the update in a fresh budget.paydaySchedules request", async () => {
    const app = buildServer();
    const created = await mutateBudget<CreatedPaydaySchedule>(app, "createPaydaySchedule", {
      name: "Original schedule 2",
      paydayDaysOfMonth: [5],
    });
    await mutateBudget<CreatedPaydaySchedule>(app, "updatePaydaySchedule", {
      id: created.id,
      name: "Persisted rename",
    });

    const schedules = await queryBudget<CreatedPaydaySchedule[]>(app, "paydaySchedules");
    const found = schedules.find((schedule) => schedule.id === created.id);
    expect(found?.name).toBe("Persisted rename");
    expect(found?.paydayDaysOfMonth).toEqual([5]);
    await app.close();
  });
});

describe("budget.updatePaydaySchedule — validation errors", () => {
  it("returns NOT_FOUND (404) for a well-formed but nonexistent id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateBudgetExpectingError(app, "updatePaydaySchedule", {
      id: "schedule-does-not-exist",
      name: "Nope",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("rejects an empty/whitespace-only name (unwrapped Error, surfaces as 500)", async () => {
    const app = buildServer();
    const created = await mutateBudget<CreatedPaydaySchedule>(app, "createPaydaySchedule", {
      name: "Valid",
      paydayDaysOfMonth: [1],
    });
    const { statusCode } = await mutateBudgetExpectingError(app, "updatePaydaySchedule", {
      id: created.id,
      name: "   ",
    });
    expect(statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });
});

describe("budget.updateBudgetLine — success", () => {
  it("applies a partial update, round-tripping the new fields, leaving unspecified fields unchanged", async () => {
    const app = buildServer();
    const created = await mutateBudget<CreatedBudgetLine>(app, "createBudgetLine", {
      paydayDate: "2026-10-15",
      subEnvelopeId: "sub-envelope-groceries-fund",
      amount: "100.00",
      description: "October groceries",
    });

    const updated = await mutateBudget<CreatedBudgetLine>(app, "updateBudgetLine", {
      id: created.id,
      amount: "150.00",
      description: "October groceries (revised)",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.amount).toBe(15000);
    expect(updated.description).toBe("October groceries (revised)");
    expect(updated.subEnvelopeId).toBe("sub-envelope-groceries-fund");
    expect(updated.paydayDate).toBe("2026-10-15");
    await app.close();
  });

  it("re-derives budgetPeriod from a new paydayDate automatically (router-level derivation, distinct from the domain function's own no-auto-derive contract)", async () => {
    const app = buildServer();
    const created = await mutateBudget<CreatedBudgetLine>(app, "createBudgetLine", {
      paydayDate: "2026-10-15",
      subEnvelopeId: "sub-envelope-groceries-fund",
      amount: "100.00",
      description: "October groceries 2",
    });
    expect(created.budgetPeriod).toEqual({ year: 2026, month: 10 });

    const updated = await mutateBudget<CreatedBudgetLine>(app, "updateBudgetLine", {
      id: created.id,
      paydayDate: "2026-11-01",
    });

    expect(updated.paydayDate).toBe("2026-11-01");
    expect(updated.budgetPeriod).toEqual({ year: 2026, month: 11 });
    await app.close();
  });
});

describe("budget.updateBudgetLine — persistence", () => {
  it("persists the update, visible in a fresh budget.budgetLines request", async () => {
    const app = buildServer();
    const created = await mutateBudget<CreatedBudgetLine>(app, "createBudgetLine", {
      paydayDate: "2026-10-20",
      subEnvelopeId: "sub-envelope-groceries-fund",
      amount: "10.00",
      description: "Persisted original",
    });
    await mutateBudget<CreatedBudgetLine>(app, "updateBudgetLine", {
      id: created.id,
      description: "Persisted updated",
    });

    const lines = await queryBudget<CreatedBudgetLine[]>(app, "budgetLines");
    const found = lines.find((line) => line.id === created.id);
    expect(found?.description).toBe("Persisted updated");
    expect(found?.amount).toBe(1000);
    await app.close();
  });
});

describe("budget.updateBudgetLine — validation errors", () => {
  it("returns NOT_FOUND (404) for a well-formed but nonexistent id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateBudgetExpectingError(app, "updateBudgetLine", {
      id: "budget-line-does-not-exist",
      description: "Nope",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns NOT_FOUND (404) for a well-formed but nonexistent subEnvelopeId", async () => {
    const app = buildServer();
    const created = await mutateBudget<CreatedBudgetLine>(app, "createBudgetLine", {
      paydayDate: "2026-10-25",
      subEnvelopeId: "sub-envelope-groceries-fund",
      amount: "10.00",
      description: "For NOT_FOUND test",
    });
    const { statusCode, error } = await mutateBudgetExpectingError(app, "updateBudgetLine", {
      id: created.id,
      subEnvelopeId: "sub-envelope-does-not-exist",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("rejects a zero amount (unwrapped Error, surfaces as 500)", async () => {
    const app = buildServer();
    const created = await mutateBudget<CreatedBudgetLine>(app, "createBudgetLine", {
      paydayDate: "2026-10-26",
      subEnvelopeId: "sub-envelope-groceries-fund",
      amount: "10.00",
      description: "For zero-amount test",
    });
    const { statusCode } = await mutateBudgetExpectingError(app, "updateBudgetLine", {
      id: created.id,
      amount: "0.00",
    });
    expect(statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });
});

describe("budget.updateBudgetLine — already-applied rejection", () => {
  it("rejects updating an already-applied line (unwrapped Error, surfaces as 500)", async () => {
    const app = buildServer();
    const created = await mutateBudget<CreatedBudgetLine>(app, "createBudgetLine", {
      paydayDate: "2026-10-27",
      subEnvelopeId: "sub-envelope-groceries-fund",
      amount: "10.00",
      description: "For already-applied test",
    });
    await mutateBudget(app, "applyBudgetLine", {
      budgetLineId: created.id,
      accountId: "account-savings",
    });

    const { statusCode } = await mutateBudgetExpectingError(app, "updateBudgetLine", {
      id: created.id,
      description: "Should not be allowed",
    });
    expect(statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });
});

// The delete-mutation tests below each create their own fresh
// PaydaySchedule/BudgetLine fixture too, for the same reason the create/
// update tests above do — a delete target must never be one of the seeded
// fixtures the apply-lifecycle tests above depend on.

describe("budget.deletePaydaySchedule — success", () => {
  it("deletes a payday schedule, no longer visible in a fresh budget.paydaySchedules request", async () => {
    const app = buildServer();
    const created = await mutateBudget<CreatedPaydaySchedule>(app, "createPaydaySchedule", {
      name: "To be deleted",
      paydayDaysOfMonth: [1],
    });

    const result = await mutateBudget<{ id: string }>(app, "deletePaydaySchedule", {
      id: created.id,
    });
    expect(result.id).toBe(created.id);

    const schedules = await queryBudget<CreatedPaydaySchedule[]>(app, "paydaySchedules");
    expect(schedules.find((schedule) => schedule.id === created.id)).toBeUndefined();
    await app.close();
  });
});

describe("budget.deletePaydaySchedule — validation errors", () => {
  it("returns NOT_FOUND (404) for a well-formed but nonexistent id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateBudgetExpectingError(app, "deletePaydaySchedule", {
      id: "schedule-does-not-exist",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns NOT_FOUND (404) when deleting the same id a second time", async () => {
    const app = buildServer();
    const created = await mutateBudget<CreatedPaydaySchedule>(app, "createPaydaySchedule", {
      name: "Delete twice",
      paydayDaysOfMonth: [1],
    });
    await mutateBudget(app, "deletePaydaySchedule", { id: created.id });

    const { statusCode, error } = await mutateBudgetExpectingError(app, "deletePaydaySchedule", {
      id: created.id,
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });
});

describe("budget.deleteBudgetLine — success", () => {
  it("deletes a budget line, no longer visible in a fresh budget.budgetLines request", async () => {
    const app = buildServer();
    const created = await mutateBudget<CreatedBudgetLine>(app, "createBudgetLine", {
      paydayDate: "2026-10-28",
      subEnvelopeId: "sub-envelope-groceries-fund",
      amount: "10.00",
      description: "To be deleted",
    });

    const result = await mutateBudget<{ id: string }>(app, "deleteBudgetLine", {
      id: created.id,
    });
    expect(result.id).toBe(created.id);

    const lines = await queryBudget<CreatedBudgetLine[]>(app, "budgetLines");
    expect(lines.find((line) => line.id === created.id)).toBeUndefined();
    await app.close();
  });

  it("deletes an already-applied budget line without error, leaving its posted transaction untouched", async () => {
    const app = buildServer();
    const created = await mutateBudget<CreatedBudgetLine>(app, "createBudgetLine", {
      paydayDate: "2026-10-29",
      subEnvelopeId: "sub-envelope-groceries-fund",
      amount: "10.00",
      description: "Applied then deleted",
    });
    const applied = await mutateBudget<AppliedTransaction>(app, "applyBudgetLine", {
      budgetLineId: created.id,
      accountId: "account-savings",
    });

    await mutateBudget(app, "deleteBudgetLine", { id: created.id });

    const lines = await queryBudget<CreatedBudgetLine[]>(app, "budgetLines");
    expect(lines.find((line) => line.id === created.id)).toBeUndefined();

    const transactions = await queryLedger<AppliedTransaction[]>(app, "transactions");
    expect(transactions.find((transaction) => transaction.id === applied.id)).toBeTruthy();
    await app.close();
  });
});

describe("budget.deleteBudgetLine — validation errors", () => {
  it("returns NOT_FOUND (404) for a well-formed but nonexistent id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateBudgetExpectingError(app, "deleteBudgetLine", {
      id: "budget-line-does-not-exist",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns NOT_FOUND (404) when deleting the same id a second time", async () => {
    const app = buildServer();
    const created = await mutateBudget<CreatedBudgetLine>(app, "createBudgetLine", {
      paydayDate: "2026-10-30",
      subEnvelopeId: "sub-envelope-groceries-fund",
      amount: "10.00",
      description: "Delete twice",
    });
    await mutateBudget(app, "deleteBudgetLine", { id: created.id });

    const { statusCode, error } = await mutateBudgetExpectingError(app, "deleteBudgetLine", {
      id: created.id,
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });
});
