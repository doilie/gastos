import { z } from "zod";

import { publicProcedure, router } from "../trpc";
import { getCategories, getTransactions } from "../store";
import { buildCategorySpendingReport } from "../reporting/category-spending";

/**
 * Read-only Reporting-layer queries. `categorySpending` is the first
 * procedure exposing `buildCategorySpendingReport` (spending per category
 * vs. income for a given calendar month) — an out-of-range or nonexistent
 * year/month is not an error, it just yields an empty report, mirroring how
 * `deriveAccountBalance`/`deriveSubEnvelopeBalance` return zero for no
 * matches.
 */
export const reportingRouter = router({
  categorySpending: publicProcedure
    .input(z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }))
    .query(({ input }) =>
      buildCategorySpendingReport(getTransactions(), getCategories(), {
        year: input.year,
        month: input.month,
      }),
    ),
});
