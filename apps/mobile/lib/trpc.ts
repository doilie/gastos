import { createTRPCReact } from "@trpc/react-query";
// Type-only import of the server's router shape (standard tRPC monorepo
// pattern): this must never pull @gastos/server's runtime code into the
// mobile bundle, only its TypeScript types for end-to-end inference.
import type { AppRouter } from "@gastos/server/src/router";

export const trpc: ReturnType<typeof createTRPCReact<AppRouter>> =
  createTRPCReact<AppRouter>();
