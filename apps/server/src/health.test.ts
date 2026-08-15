import { describe, expect, it } from "vitest";

import { buildServer } from "./index";

describe("health procedure", () => {
  it("returns HTTP 200 with { status: 'ok', sharedPackage } via app.inject()", async () => {
    const app = buildServer();

    const response = await app.inject({
      method: "GET",
      url: "/trpc/health",
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body) as {
      result: { data: { status: string; sharedPackage: string } };
    };
    expect(body.result.data.status).toBe("ok");
    expect(typeof body.result.data.sharedPackage).toBe("string");
    expect(body.result.data.sharedPackage).toBe("@gastos/shared");

    await app.close();
  });
});
