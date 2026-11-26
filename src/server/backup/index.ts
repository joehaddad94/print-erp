import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

/**
 * Weekly backup (M7): every table as JSON rows (restorable) and CSV (readable), with a
 * per-table row count and checksum, plus a manifest of the stored G-code files.
 * Works on any Postgres the app talks to; nothing here is specific to Supabase.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<PgQueryResultHKT, any>;

import { BACKUP_FORMAT, type Backup, type TableDump } from "@/lib/backup-files";

export { BACKUP_FORMAT, backupFiles, toCsv, type Backup, type TableDump } from "@/lib/backup-files";

const ident = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unexpected table name ${name}`);
  return `"${name}"`;
};

async function rows<T>(db: AnyDb, query: ReturnType<typeof sql>): Promise<T[]> {
  const res = await db.execute(query);
  return (Array.isArray(res) ? res : (res as { rows: T[] }).rows) as T[];
}

export async function tableNames(db: AnyDb): Promise<string[]> {
  const r = await rows<{ t: string }>(
    db,
    sql`select table_name as t from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
  );
  return r.map((x) => x.t);
}

/** Columns a restore can write: everything except generated columns. */
async function writableColumns(db: AnyDb, table: string): Promise<string[]> {
  const r = await rows<{ c: string }>(
    db,
    sql`select column_name as c from information_schema.columns
        where table_schema = 'public' and table_name = ${table} and is_generated = 'NEVER'
        order by ordinal_position`,
  );
  return r.map((x) => x.c);
}

/** Primary key columns; rows are dumped in key order so files read naturally and diff cleanly. */
async function primaryKey(db: AnyDb, table: string): Promise<string[]> {
  const r = await rows<{ c: string }>(
    db,
    sql`select a.attname as c from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
        where i.indrelid = ${`public.${table}`}::regclass and i.indisprimary
        order by array_position(i.indkey::int2[], a.attnum)`,
  );
  return r.map((x) => x.c);
}

/** Row count and an order-independent checksum computed by Postgres itself, so source and restore compare exactly. */
export async function tableStats(db: AnyDb, table: string): Promise<{ count: number; checksum: string }> {
  const t = ident(table);
  const [r] = await rows<{ count: string | number; checksum: string | null }>(
    db,
    sql.raw(`select count(*) as count, md5(coalesce(string_agg(x.r, '|' order by x.r), '')) as checksum
             from (select t::text as r from ${t} t) x`),
  );
  return { count: Number(r!.count), checksum: r!.checksum ?? "" };
}

export async function createBackup(db: AnyDb, now = new Date()): Promise<Backup> {
  const tables: Record<string, TableDump> = {};
  let migration: string | null = null;
  await db.transaction(
    async (tx) => {
      for (const name of await tableNames(tx)) {
        const pk = await primaryKey(tx, name);
        const order = pk.length ? ` order by ${pk.map((c) => `t.${ident(c)}`).join(", ")}` : "";
        const data = await rows<{ j: Record<string, unknown> }>(
          tx,
          sql.raw(`select row_to_json(t) as j from ${ident(name)} t${order}`),
        );
        tables[name] = {
          ...(await tableStats(tx, name)),
          columns: await writableColumns(tx, name),
          rows: data.map((d) => d.j),
        };
      }
      try {
        const [m] = await rows<{ hash: string }>(
          tx,
          sql`select hash from drizzle.__drizzle_migrations order by created_at desc limit 1`,
        );
        migration = m?.hash ?? null;
      } catch {
        migration = null;
      }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  const files = (tables.recipes?.rows ?? []).map((r) => ({
    recipeId: Number(r.id),
    name: String(r.name),
    fileName: String(r.file_name ?? ""),
    url: String(r.file_blob_url ?? ""),
    sha256: String(r.file_sha256 ?? ""),
  }));
  return { format: BACKUP_FORMAT, createdAt: now.toISOString(), migration, tables, files };
}

/**
 * Replaces every table's rows with the backup's, in one transaction, then moves identity
 * counters past the restored ids. Meant for an empty or throwaway database (restore drill,
 * disaster recovery); the caller is responsible for pointing it at the right one.
 */
export async function restoreBackup(db: AnyDb, b: Backup): Promise<void> {
  if (b.format !== BACKUP_FORMAT) throw new Error(`Unknown backup format ${String(b.format)}`);
  await db.transaction(async (tx) => {
    const present = await tableNames(tx);
    const missing = Object.keys(b.tables).filter((t) => !present.includes(t));
    if (missing.length)
      throw new Error(`The target database has no table ${missing.join(", ")}. Apply migrations first.`);
    await tx.execute(sql.raw(`truncate ${present.map(ident).join(", ")} restart identity cascade`));
    // One statement for every table: Postgres checks non-deferrable foreign keys at the end of the
    // statement, so tables that point at each other (products ↔ stock_items) restore in any order.
    const parts: ReturnType<typeof sql>[] = [];
    const filled: string[] = [];
    for (const [name, dump] of Object.entries(b.tables)) {
      if (dump.rows.length === 0) continue;
      const target = await writableColumns(tx, name);
      const cols = dump.columns
        .filter((c) => target.includes(c))
        .map(ident)
        .join(", ");
      parts.push(
        sql`${sql.raw(`${parts.length ? ", " : "with "}r${filled.length} as (insert into ${ident(name)} (${cols}) overriding system value select ${cols} from json_populate_recordset(null::${ident(name)}, `)}${JSON.stringify(dump.rows)}::json${sql.raw("))")}`,
      );
      filled.push(name);
    }
    if (parts.length) await tx.execute(sql.join([...parts, sql.raw(" select 1")]));
    for (const name of filled) {
      const ids = await rows<{ c: string }>(
        tx,
        sql`select column_name as c from information_schema.columns
            where table_schema = 'public' and table_name = ${name} and is_identity = 'YES'`,
      );
      for (const { c } of ids) {
        await tx.execute(
          sql.raw(
            `select setval(pg_get_serial_sequence('${ident(name)}', '${c}'), coalesce((select max(${ident(c)}) from ${ident(name)}), 0) + 1, false)`,
          ),
        );
      }
    }
  });
}
