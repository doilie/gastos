// Postgres client factory. Pure infrastructure — nothing in this codebase
// calls this yet (apps/server still reads from its in-memory
// apps/server/src/store.ts). Wiring a real connection into apps/server is a
// separate, later increment once a live Postgres instance is available to
// test against.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index";

/** A Drizzle client bound to this package's full schema. */
export type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Builds a Drizzle client for `connectionString` (a `postgres://...` URL,
 * see `.env.example`'s `DATABASE_URL`), wired to every table in
 * `./schema/index`.
 */
export function createDbClient(connectionString: string): Db {
  const queryClient = postgres(connectionString);
  return drizzle(queryClient, { schema });
}
