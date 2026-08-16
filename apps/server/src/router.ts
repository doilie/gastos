import { SHARED_PACKAGE_NAME } from "@gastos/shared";

import { publicProcedure, router } from "./trpc";
import { referenceRouter } from "./routers/reference";
import { ledgerRouter } from "./routers/ledger";
import { cardsRouter } from "./routers/cards";
import { budgetRouter } from "./routers/budget";

/**
 * Root tRPC router. A health check procedure plus the read-only Reference
 * layer (`reference.*`), Ledger Core layer (`ledger.*`), Credit Card queries
 * (`cards.*`), and Budget queries (`budget.*`). Still no database connection
 * — an in-memory seed store (`./store`) stands in for now — and no mutation
 * procedures for Budget yet.
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({
    status: "ok" as const,
    sharedPackage: SHARED_PACKAGE_NAME,
  })),
  reference: referenceRouter,
  ledger: ledgerRouter,
  cards: cardsRouter,
  budget: budgetRouter,
});

export type AppRouter = typeof appRouter;
