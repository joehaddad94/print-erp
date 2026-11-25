/**
 * Restore a backup JSON (Settings → Download backup, or backups/<time>/backup.json in Blob)
 * into a database that already has every migration applied. REPLACES all rows there.
 *
 *   pnpm db:restore <backup.json> <postgres-url>
 *
 * Without --yes it only restores into localhost, so a typo can't wipe the live database.
 */
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { restoreBackup, tableStats, type Backup } from "../src/server/backup";

async function main() {
  const args = process.argv.slice(2);
  const yes = args.includes("--yes");
  const [file, url] = args.filter((a) => !a.startsWith("--"));
  if (!file || !url) throw new Error("Usage: pnpm db:restore <backup.json> <postgres-url> [--yes]");
  const host = new URL(url).hostname;
  if (!yes && host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`Refusing to replace every row on ${host} without --yes.`);
  }
  const backup = JSON.parse(await readFile(file, "utf8")) as Backup;
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const db = drizzle(client);
    await restoreBackup(db, backup);
    let bad = 0;
    for (const [name, want] of Object.entries(backup.tables)) {
      const got = await tableStats(db, name);
      const ok = got.count === want.count && got.checksum === want.checksum;
      if (!ok) bad++;
      console.log(`${ok ? "ok " : "BAD"} ${name}: ${got.count} rows`);
    }
    if (bad) throw new Error(`${bad} table(s) don't match the backup.`);
    console.log(`Restored backup from ${backup.createdAt}.`);
  } finally {
    await client.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
