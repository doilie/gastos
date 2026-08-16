import { SHARED_PACKAGE_NAME } from "@gastos/shared";

import { publicProcedure, router } from "./trpc";
import { referenceRouter } from "./routers/reference";

/**
 * Root tRPC router. A health check procedure plus the read-only Reference
 * layer (`reference.*`). Still no database connection — an in-memory seed
 * store (`./store`) stands in for now — and no mutation procedures yet.
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({
    status: "ok" as const,
    sharedPackage: SHARED_PACKAGE_NAME,
  })),
  reference: referenceRouter,
});

export type AppRouter = typeof appRouter;
