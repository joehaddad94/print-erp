import { sql } from "drizzle-orm";
import { afterAll, beforeEach } from "vitest";
import { connect } from "../support/pg";

/** Each test file gets a connection; every test starts from empty tables (seed re-applied where needed). */
export function setupTestDb() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL missing: run through vitest --project db");
  const conn = connect(url);
  beforeEach(async () => {
    const rows = await conn.client<
      { tablename: string }[]
    >`select tablename from pg_tables where schemaname = 'public'`;
    await conn.db.execute(
      sql.raw(`truncate ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`),
    );
  });
  afterAll(async () => {
    await conn.client.end();
  });
  return conn;
}
