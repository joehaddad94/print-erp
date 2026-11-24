/**
 * Runs on every Vercel deploy, after migrations (package.json "vercel-build"):
 *  1. seeds defaults (idempotent),
 *  2. creates the first user from ADMIN_USERNAME / ADMIN_PASSWORD if the users table is empty.
 * Uses DIRECT_URL (session connection), falling back to DATABASE_URL.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { seed } from "../src/db/seed";
import { ensureInitialUser } from "../src/server/auth/service";

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL must be set");
  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });
  try {
    await seed(db);
    console.log("bootstrap: defaults seeded");
    const username = process.env.ADMIN_USERNAME?.trim();
    const password = process.env.ADMIN_PASSWORD;
    if (username && password) {
      if (password.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters");
      const created = await ensureInitialUser(db, username, password);
      console.log(created ? `bootstrap: created user "${username}"` : "bootstrap: a user already exists, ADMIN_* ignored");
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
