import { describe, expect, it } from "vitest";
import {
  accountIdFromString,
  deriveAccountBalance,
  deriveSubEnvelopeBalance,
  SPENDABLE_ENVELOPE_ID,
  subEnvelopeIdFromString,
} from "@gastos/shared";

import { buildServer } from "../index";
import { getTransactions } from "../store";

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

describe("ledger.transactions", () => {
  it("returns exactly what store.getTransactions() returns", async () => {
    const app = buildServer();
    const data = await queryLedger(app, "transactions");
    expect(data).toEqual(getTransactions());
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
    const expectedBalance = deriveSubEnvelopeBalance(getTransactions(), SPENDABLE_ENVELOPE_ID);
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
      getTransactions(),
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
    const expectedBalance = deriveSubEnvelopeBalance(getTransactions(), SPENDABLE_ENVELOPE_ID);
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
      getTransactions(),
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
