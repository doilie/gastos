import { publicProcedure, router } from "../trpc";
import { getBudgetLines, getPaydaySchedules } from "../store";

/**
 * Read-only Budget queries (PaydaySchedule/BudgetLine). Thin wrappers over
 * the in-memory store — no business logic here, that all lives in
 * `@gastos/shared`. No mutation procedures (an `applyBudgetLines`-backed
 * mutation is deferred to a later increment, same as `cards.ts`'s own note
 * about deferring cycle-computation endpoints) yet.
 */
export const budgetRouter = router({
  paydaySchedules: publicProcedure.query(() => getPaydaySchedules()),
  budgetLines: publicProcedure.query(() => getBudgetLines()),
});
