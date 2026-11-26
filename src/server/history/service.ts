import { and, desc, eq, getTableName, gte, inArray } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import {
  customers,
  editLog,
  expenses,
  machines,
  orderItems,
  orders,
  payments,
  products,
  stockItems,
  recipes,
  suppliers,
  users,
} from "@/db/schema";
import { updateLogged } from "@/server/edits/engine";
import { currentSettings, setSetting } from "@/server/settings/service";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * R2 Change history (owner only): every edit, delete, adjustment and settings or people change,
 * who did it, before and after, the reason, and Restore. The log is append-only: Restore
 * writes a new line, nothing is ever edited or deleted.
 */

export const AREAS = {
  sales: { label: "Sales", tables: ["customers", "orders", "order_items", "payments"] },
  printing: {
    label: "Printing",
    tables: ["print_jobs", "print_job_items", "print_job_filaments", "recipes", "machines"],
  },
  stock: { label: "Stock", tables: ["stock_movements", "stock_items", "products", "product_parts"] },
  money: { label: "Money", tables: ["expenses", "suppliers"] },
  settings: { label: "Settings and people", tables: ["settings", "users"] },
} as const;
export type Area = keyof typeof AREAS;

const areaOf = (table: string): Area | null =>
  (Object.keys(AREAS) as Area[]).find((a) => (AREAS[a].tables as readonly string[]).includes(table)) ?? null;

const LINKS: Record<string, string> = {
  expenses: "/expenses/",
  machines: "/machines/",
  suppliers: "/suppliers/",
  products: "/products/",
  recipes: "/recipes/",
  print_jobs: "/print/",
  customers: "/customers/",
  orders: "/orders/",
};
/** Tables whose rows have no page of their own: link to the list. */
const LIST_LINKS: Record<string, string> = { stock_items: "/stock" };

/** Plain values that can be put back without breaking stock, reservations or costs already worked out. */
const RESTORABLE: Record<string, { table?: PgTable; fields: string[]; undelete?: boolean }> = {
  customers: { table: customers, fields: ["name", "phone", "handle", "notes"], undelete: true },
  suppliers: { table: suppliers, fields: ["name", "contact", "notes"], undelete: true },
  machines: {
    table: machines,
    fields: [
      "name",
      "model",
      "bought_on",
      "purchase_amount",
      "purchase_rate_to_usd",
      "expected_life_hours",
      "avg_power_kw",
      "nozzle_mm",
      "notes",
    ],
  },
  products: {
    table: products,
    fields: ["name", "variant", "sale_price_usd", "packaging_item_id", "notes"],
    undelete: true,
  },
  recipes: {
    table: recipes,
    fields: [
      "name",
      "grams_override",
      "waste_allowance_pct_override",
      "labour_minutes",
      "steps_and_tips",
      "change_note",
    ],
  },
  orders: { table: orders, fields: ["due_on", "notes"] },
  order_items: { table: orderItems, fields: ["unit_price", "customization"] },
  payments: {
    table: payments,
    fields: ["paid_on", "amount", "rate_to_usd", "reference", "collected_by", "notes"],
    undelete: true,
  },
  settings: {
    fields: ["electricity_kwh_price", "usd_lbp_rate", "failure_allowance_pct", "failure_actual_after_prints"],
  },
};

export function canRestore(r: { tableName: string; field: string; action: string }): boolean {
  const rule = RESTORABLE[r.tableName];
  if (!rule) return false;
  if (r.action === "delete") return !!rule.undelete;
  return rule.fields.includes(r.field);
}

const FIELD_LABELS: Record<string, string> = {
  "*": "Whole entry",
  unit_price: "Price each",
  sale_price_usd: "Sale price",
  due_on: "Due date",
  paid_on: "Paid on",
  rate_to_usd: "Rate",
  qty_reserved: "Reserved",
  grams_override: "Grams",
  labour_minutes: "Hands-on minutes",
  avg_power_kw: "Power",
  expected_life_hours: "Expected life",
  purchase_amount: "Price paid",
  electricity_kwh_price: "Electricity per kWh",
  usd_lbp_rate: "LBP per USD",
  failure_allowance_pct: "Failure allowance",
  failure_actual_after_prints: "Use actual failures after",
  deleted_at: "Deleted",
  password: "Password",
};
export const fieldLabel = (f: string) => FIELD_LABELS[f] ?? f.charAt(0).toUpperCase() + f.slice(1).replace(/_/g, " ");

const NAMED: Record<string, { table: PgTable; col: PgColumn; id: PgColumn }> = {
  customers: { table: customers, col: customers.name, id: customers.id },
  suppliers: { table: suppliers, col: suppliers.name, id: suppliers.id },
  machines: { table: machines, col: machines.name, id: machines.id },
  products: { table: products, col: products.name, id: products.id },
  recipes: { table: recipes, col: recipes.name, id: recipes.id },
  users: { table: users, col: users.username, id: users.id },
  expenses: { table: expenses, col: expenses.description, id: expenses.id },
  stock_items: { table: stockItems, col: stockItems.name, id: stockItems.id },
};
const PREFIX: Record<string, string> = {
  orders: "Order",
  order_items: "Order line",
  payments: "Payment",
  print_jobs: "Print",
  print_job_items: "Print item",
  print_job_filaments: "Print filament",
  stock_movements: "Stock movement",
  product_parts: "Parts list line",
  settings: "Setting",
};

export type HistoryFilter = { area?: Area; who?: number; since?: Date; q?: string; limit?: number };

export async function historyFeed(db: Db, f: HistoryFilter = {}) {
  const rows = await db
    .select({ log: editLog, who: users.username })
    .from(editLog)
    .leftJoin(users, eq(users.id, editLog.editedBy))
    .where(
      and(
        f.area ? inArray(editLog.tableName, [...AREAS[f.area].tables]) : undefined,
        f.who ? eq(editLog.editedBy, f.who) : undefined,
        f.since ? gte(editLog.editedAt, f.since) : undefined,
      ),
    )
    .orderBy(desc(editLog.editedAt), desc(editLog.id))
    .limit(f.q ? 1000 : (f.limit ?? 300));

  // Names for the Item column, one query per table that appears.
  const names = new Map<string, string>();
  for (const [table, n] of Object.entries(NAMED)) {
    const ids = [...new Set(rows.filter((r) => r.log.tableName === table).map((r) => r.log.rowId))];
    if (!ids.length) continue;
    const found = await db.select({ id: n.id, name: n.col }).from(n.table).where(inArray(n.id, ids));
    for (const x of found) names.set(`${table}:${x.id}`, String(x.name ?? ""));
  }

  const out = rows.map(({ log, who }) => {
    const item =
      log.tableName === "settings"
        ? fieldLabel(log.field)
        : names.get(`${log.tableName}:${log.rowId}`) || `${PREFIX[log.tableName] ?? log.tableName} #${log.rowId}`;
    return {
      id: log.id,
      when: log.editedAt,
      who: who ?? null,
      area: areaOf(log.tableName),
      table: log.tableName,
      item,
      href: LINKS[log.tableName]
        ? `${LINKS[log.tableName]}${log.rowId}`
        : log.tableName === "settings"
          ? "/settings"
          : (LIST_LINKS[log.tableName] ?? null),
      what: log.action === "delete" ? "Deleted" : fieldLabel(log.field),
      before: log.action === "delete" ? item : log.oldValue,
      after: log.action === "delete" ? null : log.newValue,
      reason: log.reason,
      restorable: canRestore(log),
    };
  });
  if (!f.q) return out;
  const q = f.q.trim().toLowerCase().replace(/^#/, "");
  return out
    .filter((r) =>
      [r.item, r.what, r.who, r.reason, JSON.stringify(r.before), JSON.stringify(r.after), String(r.href)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    )
    .slice(0, f.limit ?? 300);
}

export type RestoreResult = { ok: true } | { ok: false; error: string };

/**
 * Restore: puts the value from before a change back, as a new logged change (reason "Restored").
 * Refused when the value was changed again since: restore the newer change instead.
 */
export async function restoreChange(db: Db, logId: number, userId: number): Promise<RestoreResult> {
  return db.transaction(async (tx) => {
    const [log] = await tx.select().from(editLog).where(eq(editLog.id, logId));
    if (!log) return { ok: false, error: "That change no longer exists." };
    if (!canRestore(log)) return { ok: false, error: "This kind of change can't be restored from here." };
    const reason = `Restored change #${log.id}`;

    if (log.tableName === "settings") {
      const now = (await currentSettings(tx as unknown as Db))[log.field];
      if (JSON.stringify(now ?? null) !== JSON.stringify(log.newValue ?? null))
        return { ok: false, error: "This setting was changed again since. Restore the newer change instead." };
      await setSetting(tx as unknown as Db, log.field, log.oldValue, new Date(), { userId, reason });
      return { ok: true };
    }

    const rule = RESTORABLE[log.tableName]!;
    const table = rule.table as PgTable & { id: PgColumn; deletedAt: PgColumn; updatedAt: PgColumn };
    const cols = table as unknown as Record<string, PgColumn>;
    const [row] = (await tx
      .select()
      .from(table as PgTable)
      .where(eq(table.id, log.rowId))) as Record<string, unknown>[];
    if (!row) return { ok: false, error: "That entry no longer exists." };

    if (log.action === "delete") {
      if (!row.deletedAt) return { ok: false, error: "That entry isn't deleted any more." };
      await tx
        .update(table)
        .set({ deletedAt: null, updatedAt: new Date() } as never)
        .where(eq(table.id, log.rowId));
      await tx.insert(editLog).values({
        tableName: log.tableName,
        rowId: log.rowId,
        field: "deleted_at",
        oldValue: (row.deletedAt instanceof Date ? row.deletedAt.toISOString() : row.deletedAt) as never,
        newValue: null,
        reason,
        action: "edit",
        editedBy: userId,
      });
      return { ok: true };
    }

    if (row.deletedAt) return { ok: false, error: "That entry was deleted. Restore the delete first." };
    const key = Object.keys(cols).find((k) => cols[k]?.name === log.field);
    if (!key) return { ok: false, error: "That field no longer exists." };
    const norm = (v: unknown) => JSON.stringify(v instanceof Date ? v.toISOString() : (v ?? null));
    if (norm(row[key]) !== norm(log.newValue))
      return { ok: false, error: "This was changed again since. Restore the newer change instead." };
    await updateLogged(tx, table, log.rowId, { [key]: log.oldValue } as never, { userId, reason });
    return { ok: true };
  });
}

/** People changes (R1) in the same log: never restorable, never stores a password. */
export async function logPeopleChange(
  db: Db,
  e: { userId: number; actorId: number; field: string; before?: unknown; after?: unknown; action?: "edit" | "delete" },
) {
  await db.insert(editLog).values({
    tableName: getTableName(users),
    rowId: e.userId,
    field: e.field,
    oldValue: (e.before ?? null) as never,
    newValue: (e.after ?? null) as never,
    action: e.action ?? "edit",
    editedBy: e.actorId,
  });
}
