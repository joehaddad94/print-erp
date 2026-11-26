import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import { expenses, suppliers } from "@/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

const spentSql = sql<string>`coalesce((select sum(e.amount * e.rate_to_usd) from expenses e where e.supplier_id = "suppliers"."id" and e.deleted_at is null), 0)`;
const countSql = sql<string>`(select count(*) from expenses e where e.supplier_id = "suppliers"."id" and e.deleted_at is null)`;
const lastSql = sql<
  string | null
>`(select max(e.spent_on)::text from expenses e where e.supplier_id = "suppliers"."id" and e.deleted_at is null)`;

/** R7 suppliers list: total spent in USD, how many purchases, the last one. */
export async function listSuppliers(db: Db) {
  const rows = await db
    .select({ supplier: suppliers, spent: spentSql, count: countSql, last: lastSql })
    .from(suppliers)
    .where(isNull(suppliers.deletedAt))
    .orderBy(asc(suppliers.name));
  return rows.map((r) => ({
    ...r.supplier,
    totalUsd: Number(r.spent),
    purchaseCount: Number(r.count),
    lastPurchase: r.last,
  }));
}

/** R7 supplier page: details plus every purchase, and this year's spend. */
export async function getSupplier(db: Db, id: number) {
  const [s] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)));
  if (!s) return null;
  const bought = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.supplierId, id), isNull(expenses.deletedAt)))
    .orderBy(desc(expenses.spentOn), desc(expenses.id));
  const year = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" }).slice(0, 4);
  const usd = (e: (typeof bought)[number]) => e.amount * e.rateToUsd;
  return {
    ...s,
    bought,
    totalUsd: bought.reduce((n, e) => n + usd(e), 0),
    yearUsd: bought.filter((e) => e.spentOn.startsWith(year)).reduce((n, e) => n + usd(e), 0),
    lastPurchase: bought[0]?.spentOn ?? null,
  };
}

/** A contact that is only a phone number (digits, spaces, + - ( ) .) goes into the phone field. */
export const looksLikePhone = (v: string) => /^[+\d][\d\s().-]{5,}$/.test(v.trim());

/**
 * Quick add from the purchase form. A name that already exists (ignoring capitals and extra
 * spaces) returns that supplier instead of making a duplicate.
 */
export async function findOrCreateSupplier(
  db: Db,
  input: { name: string; contact: string | null; phone?: string | null },
) {
  const name = input.name.replace(/\s+/g, " ").trim();
  const [existing] = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(and(isNull(suppliers.deletedAt), sql`lower(${suppliers.name}) = lower(${name})`))
    .limit(1);
  if (existing) return { ...existing, existed: true };
  const [created] = await db
    .insert(suppliers)
    .values({ name, contact: input.phone ? null : input.contact, phone: input.phone ?? null })
    .returning({ id: suppliers.id, name: suppliers.name });
  return { ...created!, existed: false };
}
