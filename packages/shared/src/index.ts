// Entry point for @gastos/shared.
//
// This package will hold Zod schemas, Drizzle types, and domain logic shared
// between apps/server and apps/mobile. Foundation scaffold only — no real
// domain logic yet.

export * from "./money/index";
export * from "./reference/currency";
export * from "./reference/account";
export * from "./reference/category";
export * from "./reference/envelope";
export * from "./reference/credit-card";
export * from "./reference/payday-schedule";
export * from "./ledger-core/transaction";
export * from "./domain/funding-source";
export * from "./domain/transfer";
export * from "./domain/card-cycle";
export * from "./domain/card-purchase";
export * from "./domain/card-settlement";
export * from "./domain/card-cycle-settlement";
export * from "./domain/budget-period";

/** Package identity marker, used to prove the workspace/import wiring works. */
export const SHARED_PACKAGE_NAME = "@gastos/shared";
