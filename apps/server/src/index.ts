import { fileURLToPath } from "node:url";

import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify from "fastify";

import { appRouter } from "./router";

const PORT = 3000;

export function buildServer() {
  const fastify = Fastify({ logger: true });

  fastify.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: { router: appRouter },
  });

  return fastify;
}

async function start() {
  const fastify = buildServer();
  await fastify.listen({ port: PORT, host: "0.0.0.0" });
}

const isEntryPoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  start().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
