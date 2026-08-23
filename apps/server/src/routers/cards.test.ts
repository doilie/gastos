import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// This router validates settlement account/sub-envelope ids against
// Postgres-backed Reference-layer tables at handler-call time, so this file
// needs its own ephemeral, migrated, seeded testcontainers Postgres before
// importing `buildServer`, per the gastos-coder-documented conversion
// recipe. getCardPurchases/getCreditCards themselves remain synchronous and
// unaffected, but still come from the same dynamically-imported `../store`
// module since it can't be statically imported before DATABASE_URL is set.
let container: StartedPostgreSqlContainer;
let buildServer: typeof import("../index").buildServer;
let getCardPurchases: typeof import("../store").getCardPurchases;
let getCreditCards: typeof import("../store").getCreditCards;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  process.env["DATABASE_URL"] = container.getConnectionUri();

  const dbModule = await import("../db");
  await dbModule.runMigrations(dbModule.db);
  await dbModule.seedReferenceData(dbModule.db);

  ({ buildServer } = await import("../index"));
  ({ getCardPurchases, getCreditCards } = await import("../store"));
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

async function queryCards<T>(app: ReturnType<typeof buildServer>, procedure: string): Promise<T> {
  const response = await app.inject({
    method: "GET",
    url: `/trpc/cards.${procedure}`,
  });
  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body) as TrpcQueryResponse<T>;
  return body.result.data;
}

/**
 * tRPC v11 mutations go over POST with the raw input as the JSON body (no
 * `{ input: ... }` wrapper) — same pattern established in `ledger.test.ts`'s
 * `mutateLedger` helper, adapted here for the `cards` router.
 */
async function mutateCards<T>(
  app: ReturnType<typeof buildServer>,
  procedure: string,
  input: object,
): Promise<T> {
  const response = await app.inject({
    method: "POST",
    url: `/trpc/cards.${procedure}`,
    payload: input,
  });
  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body) as TrpcQueryResponse<T>;
  return body.result.data;
}

/**
 * Like `mutateCards`, but for error-path tests: doesn't assert a 200 status
 * up front, just returns the raw HTTP status and the decoded tRPC error
 * envelope so the caller can assert on both — mirrors
 * `budget.test.ts`'s `mutateBudgetExpectingError`.
 */
async function mutateCardsExpectingError(
  app: ReturnType<typeof buildServer>,
  procedure: string,
  input: object,
): Promise<{ statusCode: number; error: TrpcErrorResponse["error"] }> {
  const response = await app.inject({
    method: "POST",
    url: `/trpc/cards.${procedure}`,
    payload: input,
  });
  const body = JSON.parse(response.body) as TrpcErrorResponse;
  return { statusCode: response.statusCode, error: body.error };
}

/**
 * Like `queryCards`, but for a query on a different router (`ledger`),
 * needed to prove persistence across routers without redefining the
 * `ledger` router's own test helpers here.
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

interface SettledTransaction {
  id: string;
  date: string;
  description: string;
  categoryId: string | null;
  accountId: string;
  subEnvelopeId: string;
  counterTransactionId: string | null;
  amount: number;
}

describe("cards router — read-only queries", () => {
  it("cards.creditCards returns exactly what store.getCreditCards() returns", async () => {
    const app = buildServer();
    const data = await queryCards(app, "creditCards");
    expect(data).toEqual(getCreditCards());
    await app.close();
  });

  it("cards.cardPurchases returns exactly what store.getCardPurchases() returns", async () => {
    const app = buildServer();
    const data = await queryCards(app, "cardPurchases");
    expect(data).toEqual(getCardPurchases());
    await app.close();
  });
});

// NOTE: cards.settleCardPurchase genuinely mutates the shared in-memory
// store (a singleton array, same as ledger.addTransaction/
// budget.applyBudgetLine — see store.ts's `transactions`), and it does NOT
// mark the source CardPurchase as "settled" (documented, accepted
// limitation), so the same seeded purchase id can safely be reused across
// multiple tests/cases below without disturbing other tests — there's no
// "already settled" state to collide with. Tests still avoid asserting
// absolute counts/balances, reading state immediately before/after their
// own mutation instead, matching this repo's established shared-store test
// discipline.

describe("cards.settleCardPurchase — envelope-funded success", () => {
  it("settles card-purchase-groceries-1 against its funding envelope's own linked account", async () => {
    const app = buildServer();
    const data = await mutateCards<SettledTransaction>(app, "settleCardPurchase", {
      purchaseId: "card-purchase-groceries-1",
      accountId: "account-savings",
      subEnvelopeId: "sub-envelope-groceries-fund",
    });

    expect(typeof data.id).toBe("string");
    expect(data.id.length).toBeGreaterThan(0);
    expect(data.date).toBe("2026-08-02");
    expect(data.description).toBe("Supermarket run");
    expect(data.categoryId).toBe("category-groceries");
    expect(data.accountId).toBe("account-savings");
    expect(data.subEnvelopeId).toBe("sub-envelope-groceries-fund");
    // Key sign-convention check: settling a card purchase debits, so the
    // amount must be negated relative to the purchase's positive amount.
    expect(data.amount).toBe(-210000);
    expect(data.counterTransactionId).toBeNull();
    await app.close();
  });

  it("persists the settled transaction, visible in a fresh ledger.transactions request", async () => {
    const app = buildServer();
    const created = await mutateCards<SettledTransaction>(app, "settleCardPurchase", {
      purchaseId: "card-purchase-groceries-1",
      accountId: "account-savings",
      subEnvelopeId: "sub-envelope-groceries-fund",
    });

    // A separate, later HTTP round-trip against a different router — not
    // just reusing the mutation's own return value — proves the store
    // actually retained it.
    const allTransactions = await queryLedger<SettledTransaction[]>(app, "transactions");
    const found = allTransactions.find((transaction) => transaction.id === created.id);
    expect(found).toEqual(created);
    await app.close();
  });
});

describe("cards.settleCardPurchase — account-funded success", () => {
  it("settles card-purchase-transport-1 against its funding account", async () => {
    const app = buildServer();
    const data = await mutateCards<SettledTransaction>(app, "settleCardPurchase", {
      purchaseId: "card-purchase-transport-1",
      accountId: "account-checking",
      subEnvelopeId: "spendable",
    });

    expect(data.date).toBe("2026-07-20");
    expect(data.description).toBe("Grab ride");
    expect(data.categoryId).toBe("category-transport");
    expect(data.accountId).toBe("account-checking");
    expect(data.subEnvelopeId).toBe("spendable");
    expect(data.amount).toBe(-45000);
    expect(data.counterTransactionId).toBeNull();
    await app.close();
  });
});

describe("cards.settleCardPurchase — domain validation errors", () => {
  it("rejects settling the envelope-funded purchase against an account not linked to the funding envelope", async () => {
    const app = buildServer();
    // account-checking exists but is not one of
    // sub-envelope-groceries-fund's linked accounts (only account-savings
    // is, per the seed data) — the underlying settleCardPurchase domain
    // function throws a plain Error for this, surfaced by tRPC as
    // INTERNAL_SERVER_ERROR/500, same pattern as budget.applyBudgetLine's
    // equivalent mismatch case.
    const { statusCode } = await mutateCardsExpectingError(app, "settleCardPurchase", {
      purchaseId: "card-purchase-groceries-1",
      accountId: "account-checking",
      subEnvelopeId: "sub-envelope-groceries-fund",
    });
    expect(statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });

  it("rejects settling the account-funded purchase against a different, real account", async () => {
    const app = buildServer();
    // account-savings exists but is not card-purchase-transport-1's
    // account-funded FundingSource (that's account-checking).
    const { statusCode } = await mutateCardsExpectingError(app, "settleCardPurchase", {
      purchaseId: "card-purchase-transport-1",
      accountId: "account-savings",
      subEnvelopeId: "spendable",
    });
    expect(statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });

  it("rejects settling the unfunded purchase (card-purchase-groceries-2)", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateCardsExpectingError(app, "settleCardPurchase", {
      purchaseId: "card-purchase-groceries-2",
      accountId: "account-checking",
      subEnvelopeId: "spendable",
    });
    expect(statusCode).toBeGreaterThanOrEqual(400);
    // settleCardPurchase's own Error message names the "unfunded" case
    // explicitly — asserting on it here, mirroring how this repo's other
    // 500-path tests sometimes check the specific message when convenient.
    expect(error.message).toMatch(/unfunded/i);
    await app.close();
  });
});

interface SettleCardCycleResult {
  settledTransactions: SettledTransaction[];
  skippedPurchases: { id: string }[];
}

// The seeded visaCard's (cutoffDay: 17) billing cycle containing all three
// seeded CardPurchases (per store.ts: card-purchase-transport-1 dated
// 2026-07-20, card-purchase-groceries-1 dated 2026-08-02,
// card-purchase-groceries-2 dated 2026-08-12) is 2026-07-18–2026-08-17
// inclusive.
const VISA_CYCLE = { cycleStart: "2026-07-18", cycleEnd: "2026-08-17" };

// NOTE: same shared-store discipline as cards.settleCardPurchase above —
// settleCardCycle never marks anything "settled" either, so re-settling the
// same seeded purchases across these test cases is safe.

describe("cards.settleCardCycle — success", () => {
  it("settles both funded purchases when settlements cover both, reporting the unfunded one as skipped", async () => {
    const app = buildServer();
    const data = await mutateCards<SettleCardCycleResult>(app, "settleCardCycle", {
      creditCardId: "credit-card-visa",
      ...VISA_CYCLE,
      settlements: [
        { purchaseId: "card-purchase-transport-1", accountId: "account-checking", subEnvelopeId: "spendable" },
        {
          purchaseId: "card-purchase-groceries-1",
          accountId: "account-savings",
          subEnvelopeId: "sub-envelope-groceries-fund",
        },
      ],
    });

    expect(data.settledTransactions).toHaveLength(2);
    const transport = data.settledTransactions.find(
      (transaction) => transaction.accountId === "account-checking",
    );
    expect(transport?.subEnvelopeId).toBe("spendable");
    expect(transport?.amount).toBe(-45000);
    const groceries = data.settledTransactions.find(
      (transaction) => transaction.accountId === "account-savings",
    );
    expect(groceries?.subEnvelopeId).toBe("sub-envelope-groceries-fund");
    expect(groceries?.amount).toBe(-210000);

    expect(data.skippedPurchases).toHaveLength(1);
    expect(data.skippedPurchases[0]?.id).toBe("card-purchase-groceries-2");
    await app.close();
  });
});

describe("cards.settleCardCycle — partial/empty batches", () => {
  it("with an empty settlements array, settles nothing and skips all 3 in-cycle purchases", async () => {
    const app = buildServer();
    const data = await mutateCards<SettleCardCycleResult>(app, "settleCardCycle", {
      creditCardId: "credit-card-visa",
      ...VISA_CYCLE,
      settlements: [],
    });

    expect(data.settledTransactions).toHaveLength(0);
    expect(data.skippedPurchases).toHaveLength(3);
    const skippedIds = data.skippedPurchases.map((purchase) => purchase.id);
    expect(skippedIds).toEqual(
      expect.arrayContaining([
        "card-purchase-transport-1",
        "card-purchase-groceries-1",
        "card-purchase-groceries-2",
      ]),
    );
    await app.close();
  });

  it("settles only the listed funded purchase, leaving the other funded-but-unlisted plus the unfunded one skipped", async () => {
    const app = buildServer();
    const data = await mutateCards<SettleCardCycleResult>(app, "settleCardCycle", {
      creditCardId: "credit-card-visa",
      ...VISA_CYCLE,
      settlements: [
        { purchaseId: "card-purchase-transport-1", accountId: "account-checking", subEnvelopeId: "spendable" },
      ],
    });

    expect(data.settledTransactions).toHaveLength(1);
    expect(data.settledTransactions[0]?.accountId).toBe("account-checking");

    // Skipped: card-purchase-groceries-1 (funded but unlisted) and
    // card-purchase-groceries-2 (unfunded) — 2 total, NOT
    // card-purchase-transport-1, since it was settled.
    expect(data.skippedPurchases).toHaveLength(2);
    const skippedIds = data.skippedPurchases.map((purchase) => purchase.id);
    expect(skippedIds).toEqual(
      expect.arrayContaining(["card-purchase-groceries-1", "card-purchase-groceries-2"]),
    );
    expect(skippedIds).not.toContain("card-purchase-transport-1");
    await app.close();
  });

  it("with a cycle window excluding all 3 purchases, settles nothing and skips nothing (not even as skipped)", async () => {
    const app = buildServer();
    const data = await mutateCards<SettleCardCycleResult>(app, "settleCardCycle", {
      creditCardId: "credit-card-visa",
      cycleStart: "2026-01-01",
      cycleEnd: "2026-01-31",
      settlements: [],
    });

    expect(data.settledTransactions).toHaveLength(0);
    expect(data.skippedPurchases).toHaveLength(0);
    await app.close();
  });
});

describe("cards.settleCardCycle — domain validation error", () => {
  it("propagates a non-2xx when a settlement resolves to an account not linked to the purchase's funding envelope", async () => {
    const app = buildServer();
    // account-checking is not one of sub-envelope-groceries-fund's linked
    // accounts (only account-savings is) — same mismatch as
    // settleCardPurchase's own equivalent test above. The whole batch
    // request fails; this is not converted into a per-item skip.
    const { statusCode } = await mutateCardsExpectingError(app, "settleCardCycle", {
      creditCardId: "credit-card-visa",
      ...VISA_CYCLE,
      settlements: [
        {
          purchaseId: "card-purchase-groceries-1",
          accountId: "account-checking",
          subEnvelopeId: "sub-envelope-groceries-fund",
        },
      ],
    });
    expect(statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });
});

describe("cards.settleCardCycle — NOT_FOUND validation errors", () => {
  it("returns NOT_FOUND (404) for a well-formed but nonexistent creditCardId", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateCardsExpectingError(app, "settleCardCycle", {
      creditCardId: "credit-card-does-not-exist",
      ...VISA_CYCLE,
      settlements: [],
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns NOT_FOUND (404) when a settlements[] entry has a nonexistent purchaseId", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateCardsExpectingError(app, "settleCardCycle", {
      creditCardId: "credit-card-visa",
      ...VISA_CYCLE,
      settlements: [
        { purchaseId: "card-purchase-does-not-exist", accountId: "account-checking", subEnvelopeId: "spendable" },
      ],
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns NOT_FOUND (404) when a settlements[] entry has a nonexistent accountId", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateCardsExpectingError(app, "settleCardCycle", {
      creditCardId: "credit-card-visa",
      ...VISA_CYCLE,
      settlements: [
        {
          purchaseId: "card-purchase-transport-1",
          accountId: "account-does-not-exist",
          subEnvelopeId: "spendable",
        },
      ],
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns NOT_FOUND (404) when a settlements[] entry has a nonexistent subEnvelopeId", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateCardsExpectingError(app, "settleCardCycle", {
      creditCardId: "credit-card-visa",
      ...VISA_CYCLE,
      settlements: [
        {
          purchaseId: "card-purchase-transport-1",
          accountId: "account-checking",
          subEnvelopeId: "sub-envelope-does-not-exist",
        },
      ],
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });
});

describe("cards.settleCardPurchase — NOT_FOUND validation errors", () => {
  it("returns NOT_FOUND (404) for a well-formed but nonexistent purchaseId", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateCardsExpectingError(app, "settleCardPurchase", {
      purchaseId: "card-purchase-does-not-exist",
      accountId: "account-checking",
      subEnvelopeId: "spendable",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns NOT_FOUND (404) for a well-formed but nonexistent accountId", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateCardsExpectingError(app, "settleCardPurchase", {
      purchaseId: "card-purchase-transport-1",
      accountId: "account-does-not-exist",
      subEnvelopeId: "spendable",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns NOT_FOUND (404) for a well-formed but nonexistent subEnvelopeId", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateCardsExpectingError(app, "settleCardPurchase", {
      purchaseId: "card-purchase-transport-1",
      accountId: "account-checking",
      subEnvelopeId: "sub-envelope-does-not-exist",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });
});
