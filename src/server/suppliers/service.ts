import { asc, isNull, sql } from "drizzle-orm";
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
