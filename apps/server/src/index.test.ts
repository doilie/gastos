import { describe, expect, it } from "vitest";

import { buildServer } from "./index";

// Regression coverage for the missing-CORS bug: a browser-based client (the
// mobile app's web build) reading any API response requires an
// Access-Control-Allow-Origin header on the actual response, and a clean
// (non-tRPC-error) response to the browser's OPTIONS preflight. `curl`
// doesn't enforce CORS, so these failures were invisible to a plain curl
// smoke test — only a browser (or an inject() call that inspects headers,
// as below) would catch them.
describe("CORS wiring", () => {
  it("reflects the request Origin back on a cross-origin GET response", async () => {
    const app = buildServer();

    const response = await app.inject({
      method: "GET",
      url: "/trpc/health",
      headers: { origin: "http://localhost:8081" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:8081",
    );

    await app.close();
  });

  it("answers an OPTIONS preflight with a 2xx CORS response, not a tRPC error", async () => {
    const app = buildServer();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/trpc/ledger.spendableBalance",
      headers: {
        origin: "http://localhost:8081",
        "access-control-request-method": "GET",
      },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(200);
    expect(response.statusCode).toBeLessThan(300);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:8081",
    );

    await app.close();
  });
});
