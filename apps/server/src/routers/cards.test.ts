import { describe, expect, it } from "vitest";

import { buildServer } from "../index";
import { getCardPurchases, getCreditCards } from "../store";

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
