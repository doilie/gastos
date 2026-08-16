import { describe, expect, it } from "vitest";

import { buildServer } from "../index";
import { getAccounts, getCategories, getEnvelopeGroups, getSubEnvelopes } from "../store";

interface TrpcQueryResponse<T> {
  result: { data: T };
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

describe("reference router", () => {
  it("reference.accounts returns exactly what store.getAccounts() returns", async () => {
    const app = buildServer();
    const data = await queryReference(app, "accounts");
    expect(data).toEqual(getAccounts());
    await app.close();
  });

  it("reference.categories returns exactly what store.getCategories() returns", async () => {
    const app = buildServer();
    const data = await queryReference(app, "categories");
    expect(data).toEqual(getCategories());
    await app.close();
  });

  it("reference.envelopeGroups returns exactly what store.getEnvelopeGroups() returns", async () => {
    const app = buildServer();
    const data = await queryReference(app, "envelopeGroups");
    expect(data).toEqual(getEnvelopeGroups());
    await app.close();
  });

  it("reference.subEnvelopes returns exactly what store.getSubEnvelopes() returns", async () => {
    const app = buildServer();
    const data = await queryReference(app, "subEnvelopes");
    expect(data).toEqual(getSubEnvelopes());
    await app.close();
  });
});
