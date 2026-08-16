import { describe, expect, it } from "vitest";

import { buildServer } from "../index";
import { getCardPurchases, getCreditCards } from "../store";

interface TrpcQueryResponse<T> {
  result: { data: T };
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

describe("cards router", () => {
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
