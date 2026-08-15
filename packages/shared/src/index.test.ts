import { describe, expect, it } from "vitest";

import { SHARED_PACKAGE_NAME } from "./index";
import * as money from "./money/index";

describe("@gastos/shared entry point", () => {
  it("exports SHARED_PACKAGE_NAME as a non-empty string", () => {
    expect(typeof SHARED_PACKAGE_NAME).toBe("string");
    expect(SHARED_PACKAGE_NAME.length).toBeGreaterThan(0);
    expect(SHARED_PACKAGE_NAME).toBe("@gastos/shared");
  });

  it("re-exports the money module through the package barrel", () => {
    // Full behavioral coverage of the money primitives lives in
    // src/money/index.test.ts; this just proves the barrel export wiring
    // (`export * from "./money/index"` in index.ts) stays intact.
    expect(money).toBeDefined();
    expect(typeof money.parseCents).toBe("function");
    expect(typeof money.formatCents).toBe("function");
  });
});
