/**
 * `pnpm test:e2e:pooled [playwright args]`: the full E2E suite with the app's DATABASE_URL going
 * through PgBouncer in transaction mode (like Supabase's pooler on port 6543). Setup and assertions
 * still use the direct connection. Start the pooler first: tests/e2e/README.md.
 */
import { spawnSync } from "node:child_process";
import postgres from "postgres";

const url = process.env.E2E_POOLER_URL ?? "postgres://postgres:postgres@127.0.0.1:6543/print_erp_e2e";

async function main() {
  // The e2e database is (re)created by global setup, so probe the pooler on the admin database.
  const probe = new URL(url);
  probe.pathname = "/postgres";
  const sql = postgres(probe.toString(), { prepare: false, max: 1, connect_timeout: 5, onnotice: () => {} });
  try {
    await sql`select 1`;
  } catch (e) {
    console.error(`No pooler at ${probe.host}: ${e instanceof Error ? e.message : String(e)}`);
    console.error("Start PgBouncer in transaction mode first (tests/e2e/README.md).");
    process.exit(1);
  } finally {
    await sql.end({ timeout: 1 });
  }
  console.log(`App DATABASE_URL → pooler ${probe.host}`);
  const run = spawnSync("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, E2E_APP_DATABASE_URL: url },
  });
  process.exit(run.status ?? 1);
}

void main();
