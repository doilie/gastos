import { fileURLToPath } from "node:url";

import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify from "fastify";

import { db, runMigrations, seedReferenceData } from "./db";
import { appRouter } from "./router";

const PORT = 3000;

export function buildServer() {
  const fastify = Fastify({ logger: true });

  // Dev-only, intentionally permissive: this app has no deployment or auth
  // system yet, so there's no meaningful origin to restrict to. Tighten this
  // once the app has a real deployment target.
  fastify.register(cors, { origin: true });

  fastify.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: { router: appRouter },
  });

  return fastify;
}

async function start() {
  const fastify = buildServer();

  // Applies any not-yet-applied Postgres migration, then seeds the fixture
  // Reference-layer data (idempotent — safe on every start). Deliberately
  // not part of buildServer() itself: tests call buildServer() directly via
  // app.inject(...) and don't want a live migration/seed run against a real
  // database as a side effect of just constructing the Fastify app.
  await runMigrations(db);
  await seedReferenceData(db);

  await fastify.listen({ port: PORT, host: "0.0.0.0" });
}

const isEntryPoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  start().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
