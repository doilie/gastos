import { describe, expect, it } from "vitest";

import { SHARED_PACKAGE_NAME } from "./index";
import * as money from "./money/index";

describe("@gastos/shared entry point", () => {
  it("exports SHARED_PACKAGE_NAME as a non-empty string", () => {
    expect(typeof SHARED_PACKAGE_NAME).toBe("string");
    expect(SHARED_PACKAGE_NAME.length).toBeGreaterThan(0);
    expect(SHARED_PACKAGE_NAME).toBe("@gastos/shared");
  });

  it("imports the money placeholder module without throwing", () => {
    // Foundation scaffold only: money/index.ts is currently an empty
    // placeholder (`export {}`). This just proves the module resolves and
    // loads cleanly so real Cents/money exports can land here later without
    // breaking the import graph.
    expect(money).toBeDefined();
  });
});
