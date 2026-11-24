import { defineConfig } from "drizzle-kit";

/**
 * Migrations use the direct/session connection (DIRECT_URL, port 5432), not the
 * transaction pooler, because they need a stable session.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/print_erp",
  },
  strict: true,
  verbose: true,
});
