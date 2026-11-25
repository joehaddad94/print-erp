import { and, asc, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import { suppliers } from "@/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

/** Suppliers with total spent in USD (D30). */
export async function listSuppliers(db: Db) {
  const rows = await db
    .select({
      supplier: suppliers,
      totalUsd: sql<string>`coalesce((select sum(e.amount * e.rate_to_usd) from expenses e where e.supplier_id = "suppliers"."id" and e.deleted_at is null), 0)`,
    })
    .from(suppliers)
    .where(isNull(suppliers.deletedAt))
    .orderBy(asc(suppliers.name));
  return rows.map((r) => ({ ...r.supplier, totalUsd: Number(r.totalUsd) }));
}

/**
 * Quick add from the expense form. A name that already exists (ignoring capitals and extra
 * spaces) returns that supplier instead of making a duplicate.
 */
export async function findOrCreateSupplier(db: Db, input: { name: string; contact: string | null }) {
  const name = input.name.replace(/\s+/g, " ").trim();
  const [existing] = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(and(isNull(suppliers.deletedAt), sql`lower(${suppliers.name}) = lower(${name})`))
    .limit(1);
  if (existing) return { ...existing, existed: true };
  const [created] = await db
    .insert(suppliers)
    .values({ name, contact: input.contact })
    .returning({ id: suppliers.id, name: suppliers.name });
  return { ...created!, existed: false };
}
