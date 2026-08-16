import { describe, expect, it } from "vitest";

import { buildServer } from "../index";
import { getBudgetLines, getPaydaySchedules } from "../store";

interface TrpcQueryResponse<T> {
  result: { data: T };
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
