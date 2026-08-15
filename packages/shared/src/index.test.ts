import { describe, expect, it } from "vitest";

import { SHARED_PACKAGE_NAME } from "./index";
import * as money from "./money/index";
import * as account from "./reference/account";
import * as category from "./reference/category";
import * as currency from "./reference/currency";

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

  it("re-exports the reference/currency module through the package barrel", () => {
    // Full behavioral coverage lives in src/reference/currency.test.ts; this
    // just proves the barrel export wiring stays intact.
    expect(currency).toBeDefined();
    expect(typeof currency.currencyCodeFromString).toBe("function");
  });

  it("re-exports the reference/account module through the package barrel", () => {
    // Full behavioral coverage lives in src/reference/account.test.ts; this
    // just proves the barrel export wiring stays intact.
    expect(account).toBeDefined();
    expect(typeof account.accountIdFromString).toBe("function");
    expect(typeof account.createAccount).toBe("function");
  });

  it("re-exports the reference/category module through the package barrel", () => {
    // Full behavioral coverage lives in src/reference/category.test.ts; this
    // just proves the barrel export wiring stays intact.
    expect(category).toBeDefined();
    expect(typeof category.categoryIdFromString).toBe("function");
    expect(typeof category.createCategory).toBe("function");
  });
});
