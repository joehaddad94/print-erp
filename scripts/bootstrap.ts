/**
 * Runs before `next build` on Vercel production builds only (VERCEL_ENV=production), or with --force.
 * Preview builds of unmerged branches never touch the live database (D44: one live env):
 *  1. applies pending migrations from ./drizzle,
 *  2. seeds defaults (idempotent),
 *  3. creates the first user from ADMIN_USERNAME / ADMIN_PASSWORD if the users table is empty.
 * Uses DIRECT_URL (Supabase session pooler, port 5432), falling back to DATABASE_URL.
 * A failure stops the deploy, so a broken migration never reaches production.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { seed } from "../src/db/seed";
import { ensureInitialUser } from "../src/server/auth/service";

async function main() {
  if (process.env.VERCEL_ENV !== "production" && !process.argv.includes("--force")) {
    console.log(
      `bootstrap: skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}; runs on production builds or --force)`,
    );
    return;
  }
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL must be set");
  const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("bootstrap: migrations applied");
    await seed(db);
    console.log("bootstrap: defaults seeded");
    const username = process.env.ADMIN_USERNAME?.trim();
    const password = process.env.ADMIN_PASSWORD;
    if (username && password) {
      if (password.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters");
      const created = await ensureInitialUser(db, username, password);
      console.log(
        created ? `bootstrap: created user "${username}"` : "bootstrap: a user already exists, ADMIN_* ignored",
      );
    } else {
      console.log("bootstrap: ADMIN_USERNAME/ADMIN_PASSWORD not set, no user created");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
