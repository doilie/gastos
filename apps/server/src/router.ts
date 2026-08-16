import { SHARED_PACKAGE_NAME } from "@gastos/shared";

import { publicProcedure, router } from "./trpc";
import { referenceRouter } from "./routers/reference";
import { ledgerRouter } from "./routers/ledger";
import { cardsRouter } from "./routers/cards";

/**
 * Root tRPC router. A health check procedure plus the read-only Reference
 * layer (`reference.*`), Ledger Core layer (`ledger.*`), and Credit Card
 * queries (`cards.*`). Still no database connection — an in-memory seed store
 * (`./store`) stands in for now — and no mutation procedures yet.
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({
    status: "ok" as const,
    sharedPackage: SHARED_PACKAGE_NAME,
  })),
  reference: referenceRouter,
  ledger: ledgerRouter,
  cards: cardsRouter,
});

export type AppRouter = typeof appRouter;
