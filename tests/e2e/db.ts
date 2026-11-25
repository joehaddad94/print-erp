import { readdirSync } from "node:fs";
import { sql } from "drizzle-orm";
import { E2E_DB, E2E_UPLOAD_DIR } from "../../playwright.config";
import { connect, urlFor } from "../support/pg";

/** Direct access to the e2e database, for test setup and "nothing was saved" checks only. */
export async function withDb<T>(fn: (db: ReturnType<typeof connect>["db"]) => Promise<T>): Promise<T> {
  const conn = connect(urlFor(E2E_DB));
  try {
    return await fn(conn.db);
  } finally {
    await conn.client.end();
  }
}

/** Row count of every public table (K-02). */
export async function rowCounts(): Promise<Record<string, number>> {
  return withDb(async (db) => {
    const tables = (await db.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
    )) as unknown as { tablename: string }[];
    const out: Record<string, number> = {};
    for (const { tablename } of tables) {
      const [r] = (await db.execute(sql.raw(`select count(*)::int as n from "${tablename}"`))) as unknown as {
        n: number;
      }[];
      out[tablename] = r!.n;
    }
    return out;
  });
}

export function uploadedFileCount(): number {
  try {
    return readdirSync(E2E_UPLOAD_DIR).length;
  } catch {
    return 0;
  }
}
