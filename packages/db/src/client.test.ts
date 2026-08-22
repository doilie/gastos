// Unit coverage for createDbClient. The `postgres` (postgres.js) driver is
// lazy — constructing a client with `postgres(connectionString)` does not
// open a network connection; that only happens on first query (see
// packages/db/src/client.ts's own header comment). So this test can run
// with no Postgres instance available (and no Docker) by asserting the
// client's shape without ever issuing a query.

import { describe, expect, it } from "vitest";

import { createDbClient } from "./client";

describe("createDbClient", () => {
  it("returns a Drizzle client without attempting a network connection", () => {
    // Syntactically valid postgres:// URL pointing at a port nothing is
    // listening on. If createDbClient (or drizzle()/postgres()) eagerly
    // connected, constructing it synchronously would still succeed (the
    // driver is lazy either way) — the real proof of laziness is that this
    // whole test completes without ever awaiting/triggering a query, and
    // does so well within the test timeout despite the connection being
    // unreachable.
    const db = createDbClient("postgres://fake:fake@localhost:5432/fake");

    expect(db).toBeDefined();
    // Drizzle's postgres-js client exposes `.query` (per-table query API)
    // and `.execute` (raw SQL escape hatch) among other things — presence
    // of these confirms we got a real Drizzle instance, not e.g. undefined
    // or a bare postgres.js client.
    expect(db.query).toBeDefined();
    expect(typeof db.execute).toBe("function");

    // Every table from the schema barrel should be reachable off `db.query`
    // (drizzle's relational query builder keys them by the schema export
    // name), confirming createDbClient wired the full schema through.
    expect(db.query.accounts).toBeDefined();
    expect(db.query.categories).toBeDefined();
    expect(db.query.envelopeGroups).toBeDefined();
    expect(db.query.subEnvelopes).toBeDefined();
    expect(db.query.subEnvelopeAccounts).toBeDefined();
    expect(db.query.creditCards).toBeDefined();
    expect(db.query.paydaySchedules).toBeDefined();
    expect(db.query.transactions).toBeDefined();
    expect(db.query.cardPurchases).toBeDefined();
    expect(db.query.budgetLines).toBeDefined();
  });
});
