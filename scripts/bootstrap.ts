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
  const source = process.env.DIRECT_URL ? "DIRECT_URL" : "DATABASE_URL";
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL must be set for Production in Vercel");
  console.log(`bootstrap: connecting with ${source} → ${describeUrl(url)}`);
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

/** host, port, user and database of a Postgres URL, never the password. Exported for tests. */
export function describeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.username || "?"}@${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(not a valid URL: check for unencoded special characters in the password)";
  }
}

/** One-line cause for the most common Supabase setup mistakes. */
export function hint(err: unknown): string {
  const e = err as { code?: string; message?: string; cause?: { code?: string } };
  const code = e?.code ?? e?.cause?.code ?? "";
  const msg = String(e?.message ?? err);
  if (code === "28P01" || /password authentication failed/i.test(msg))
    return "Wrong database password: if it was reset in Supabase, update DATABASE_URL and DIRECT_URL in Vercel.";
  if (/Tenant or user not found/i.test(msg))
    return "The pooler user must be postgres.<project-ref>: copy the URL again from Supabase → Connect.";
  if (code === "ENOTFOUND" || code === "ENETUNREACH" || code === "EAI_AGAIN")
    return "Host unreachable: use the Session pooler URL (port 5432), not the direct db.<ref>.supabase.co host (IPv6 only).";
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT")
    return "Connection refused or timed out: check the host and port, and that the Supabase project isn't paused.";
  return "";
}

if (process.argv[1]?.endsWith("bootstrap.ts")) {
  main().catch((err) => {
    const e = err as { code?: string; cause?: { code?: string } };
    console.error(`bootstrap FAILED: ${err instanceof Error ? err.message : String(err)}`);
    const code = e?.code ?? e?.cause?.code;
    if (code) console.error(`bootstrap: error code ${code}`);
    const h = hint(err);
    if (h) console.error(`bootstrap: likely fix → ${h}`);
    process.exit(1);
  });
}
