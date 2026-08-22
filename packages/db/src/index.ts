// Entry point for @gastos/db: Drizzle ORM schema and Postgres client for
// gastos, server-only (apps/mobile never depends on this package — see
// CLAUDE.md's "Workspace layout"). Pure infrastructure/schema scaffolding —
// nothing in apps/server reads from this yet; that swap from
// apps/server/src/store.ts's in-memory arrays is a separate, later
// increment.

export * from "./schema/index";
export * from "./client";
