import { describe, expect, it } from "vitest";
import { deriveSubEnvelopeBalance, SPENDABLE_ENVELOPE_ID } from "@gastos/shared";

import { buildServer } from "../index";
import { getTransactions } from "../store";

interface TrpcQueryResponse<T> {
  result: { data: T };
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

describe("ledger router", () => {
  it("ledger.transactions returns exactly what store.getTransactions() returns", async () => {
    const app = buildServer();
    const data = await queryLedger(app, "transactions");
    expect(data).toEqual(getTransactions());
    await app.close();
  });

  it("ledger.spendableBalance returns the Spendable envelope balance derived from store.getTransactions()", async () => {
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
