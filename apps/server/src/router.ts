import { SHARED_PACKAGE_NAME } from "@gastos/shared";

import { publicProcedure, router } from "./trpc";

/**
 * Root tRPC router. Foundation scaffold only — a single health check
 * procedure, no database connection, no domain logic yet.
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({
    status: "ok" as const,
    sharedPackage: SHARED_PACKAGE_NAME,
  })),
});

export type AppRouter = typeof appRouter;
