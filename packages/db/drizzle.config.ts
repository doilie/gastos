// drizzle-kit config. Reads DATABASE_URL from the repo-root .env (see
// .env.example) via dotenv; `drizzle-kit generate` only introspects
// ./src/schema/**, it never needs a live database connection, so this file
// works even with no Postgres instance running/no .env present.

import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://gastos:gastos@localhost:5432/gastos_dev";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: DATABASE_URL,
  },
});
