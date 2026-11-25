import { and, desc, eq, getTableName, inArray, type InferSelectModel } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import { editLog } from "@/db/schema";

type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type EditableTable = PgTable & { id: PgColumn; deletedAt: PgColumn; updatedAt: PgColumn };

const SKIP = new Set(["id", "createdAt", "updatedAt", "deletedAt"]);

/** Comparable, JSON-safe form of a value (numbers from numeric columns, dates as ISO). */
function norm(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (v === undefined) return null;
  return v;
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/**
 * D13: update a row and write one edit_log row per changed field, in the caller's transaction.
 * Unchanged fields write nothing. Returns the updated row and the changed field names.
 */
export async function updateLogged<T extends EditableTable>(
  tx: Tx,
  table: T,
  id: number,
  patch: Partial<InferSelectModel<T>>,
  opts: { userId?: number | null; reason?: string | null } = {},
): Promise<{ row: InferSelectModel<T>; changed: string[] }> {
  const [before] = (await tx
    .select()
    .from(table as PgTable)
    .where(eq(table.id, id))) as InferSelectModel<T>[];
  if (!before) throw new Error(`${getTableName(table)} #${id} not found`);
  const changed = Object.keys(patch).filter(
    (k) => !SKIP.has(k) && !same((before as Record<string, unknown>)[k], (patch as Record<string, unknown>)[k]),
  );
  if (changed.length === 0) return { row: before, changed };
  const set = Object.fromEntries(changed.map((k) => [k, (patch as Record<string, unknown>)[k]]));
  const [row] = (await tx
    .update(table)
    .set(set as never)
    .where(eq(table.id, id))
    .returning()) as InferSelectModel<T>[];
  const columns = table as unknown as Record<string, PgColumn>;
  await tx.insert(editLog).values(
    changed.map((k) => ({
      tableName: getTableName(table),
      rowId: id,
      field: columns[k]?.name ?? k,
      oldValue: norm((before as Record<string, unknown>)[k]) as never,
      newValue: norm((patch as Record<string, unknown>)[k]) as never,
      reason: opts.reason ?? null,
      action: "edit" as const,
      editedBy: opts.userId ?? null,
    })),
  );
  return { row: row!, changed };
}

/** D13: soft delete, logged with every value the row had. */
export async function softDeleteLogged<T extends EditableTable>(
  tx: Tx,
  table: T,
  id: number,
  opts: { userId?: number | null; reason?: string | null } = {},
) {
  const [before] = (await tx
    .select()
    .from(table as PgTable)
    .where(eq(table.id, id))) as Record<string, unknown>[];
  if (!before) throw new Error(`${getTableName(table)} #${id} not found`);
  if (before.deletedAt) return;
  await tx
    .update(table)
    .set({ deletedAt: new Date() } as never)
    .where(eq(table.id, id));
  await tx.insert(editLog).values({
    tableName: getTableName(table),
    rowId: id,
    field: "*",
    oldValue: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, norm(v)])) as never,
    newValue: null,
    reason: opts.reason ?? null,
    action: "delete",
    editedBy: opts.userId ?? null,
  });
}

/** Latest edit time per row, for the "✎ Edited" marker on lists. */
export async function lastEdited(db: Db | Tx, tableName: string, ids: number[]): Promise<Map<number, Date>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ rowId: editLog.rowId, editedAt: editLog.editedAt })
    .from(editLog)
    .where(and(eq(editLog.tableName, tableName), inArray(editLog.rowId, ids)))
    .orderBy(desc(editLog.editedAt));
  const out = new Map<number, Date>();
  for (const r of rows) if (!out.has(r.rowId)) out.set(r.rowId, r.editedAt);
  return out;
}

/** One entry's history, newest first. */
export function historyFor(db: Db | Tx, tableName: string, rowId: number) {
  return db
    .select()
    .from(editLog)
    .where(and(eq(editLog.tableName, tableName), eq(editLog.rowId, rowId)))
    .orderBy(desc(editLog.editedAt), desc(editLog.id));
}
