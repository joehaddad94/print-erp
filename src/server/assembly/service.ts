import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import {
  assemblies,
  editLog,
  orderItems,
  orders,
  productParts,
  products,
  stockAvailable,
  stockItems,
  stockMovements,
} from "@/db/schema";
import { softDeleteLogged, type Tx } from "@/server/edits/engine";
import { currentAverage, onHand, recordMovement } from "@/server/stock/ledger";

type Db = PostgresJsDatabase<typeof schema>;

export class AssemblyError extends Error {}

const label = (p: { name: string; variant: string | null }) => (p.variant ? `${p.name} (${p.variant})` : p.name);

/** Stock item for a product or part, created on first use (pieces). */
export async function stockFor(tx: Db | Tx, productId: number): Promise<number> {
  const [s] = await tx
    .select({ id: stockItems.id })
    .from(stockItems)
    .where(and(eq(stockItems.productId, productId), isNull(stockItems.deletedAt)));
  if (s) return s.id;
  const [p] = await tx.select().from(products).where(eq(products.id, productId));
  if (!p) throw new AssemblyError("Product not found.");
  const [row] = await tx
    .insert(stockItems)
    .values({
      name: label(p),
      type: p.kind === "part" ? "printed_part" : "finished_product",
      unit: "pieces",
      productId,
    })
    .returning({ id: stockItems.id });
  return row!.id;
}

// ── Parts list (D19)

export async function partsOf(db: Db | Tx, productId: number) {
  return db
    .select({
      id: productParts.id,
      partId: productParts.partId,
      qtyPerProduct: productParts.qtyPerProduct,
      name: products.name,
      variant: products.variant,
    })
    .from(productParts)
    .innerJoin(products, eq(products.id, productParts.partId))
    .where(and(eq(productParts.productId, productId), isNull(productParts.deletedAt)))
    .orderBy(asc(products.name));
}

export async function addPart(db: Db, productId: number, partId: number, qtyPerProduct: number) {
  const [[p], [part]] = await Promise.all([
    db.select().from(products).where(eq(products.id, productId)),
    db.select().from(products).where(eq(products.id, partId)),
  ]);
  if (p?.kind !== "product") throw new AssemblyError("Only a product has a parts list.");
  if (part?.kind !== "part") throw new AssemblyError("Choose a part.");
  const [existing] = await db
    .select()
    .from(productParts)
    .where(and(eq(productParts.productId, productId), eq(productParts.partId, partId), isNull(productParts.deletedAt)));
  if (existing) throw new AssemblyError("That part is already on the list. Remove it first to change the quantity.");
  await db.insert(productParts).values({ productId, partId, qtyPerProduct });
}

export async function removePart(db: Db, id: number, userId?: number) {
  return db.transaction((tx) => softDeleteLogged(tx, productParts, id, { userId }));
}

/** What Assemble shows for a product: each part, needed for N, and on hand (D36 warns, never blocks). */
export async function assemblyPlan(db: Db, productId: number, qty: number) {
  const parts = await partsOf(db, productId);
  return Promise.all(
    parts.map(async (p) => {
      const [s] = await db
        .select({ id: stockItems.id })
        .from(stockItems)
        .where(and(eq(stockItems.productId, p.partId), isNull(stockItems.deletedAt)));
      const have = s ? await onHand(db, s.id) : 0;
      return { ...p, needed: p.qtyPerProduct * qty, onHand: have, short: Math.max(0, p.qtyPerProduct * qty - have) };
    }),
  );
}

/**
 * B-01 Assemble (D19, D24, D36): made N of X. One transaction: −parts at their average cost,
 * +product at Σ(part average × qty per product); minutes per unit = assembly minutes + parts' minutes.
 * Parts may go negative (D36): the screen warns, the save is allowed.
 */
export async function assemble(
  db: Db,
  i: {
    productId: number;
    qty: number;
    assemblyMinutesPerUnit: number | null;
    assembledOn: string;
    notes: string | null;
  },
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const parts = await partsOf(tx, i.productId);
    if (parts.length === 0) throw new AssemblyError("This product has no parts list. Add its parts first.");
    let unitCost = 0;
    let partMinutes: number | null = 0;
    const outs: { stockId: number; amount: number }[] = [];
    for (const p of parts) {
      const stockId = await stockFor(tx, p.partId);
      unitCost += ((await currentAverage(tx, stockId)) ?? 0) * p.qtyPerProduct;
      const [m] = await tx
        .select({ v: stockMovements.labourMinutesPerUnit })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.stockItemId, stockId),
            isNull(stockMovements.deletedAt),
            sql`${stockMovements.amount} > 0`,
          ),
        )
        .orderBy(desc(stockMovements.movedAt), desc(stockMovements.id))
        .limit(1);
      partMinutes = partMinutes == null || m?.v == null ? null : partMinutes + m.v * p.qtyPerProduct;
      outs.push({ stockId, amount: -p.qtyPerProduct * i.qty });
    }
    const minutes =
      i.assemblyMinutesPerUnit == null && partMinutes == null
        ? null
        : (i.assemblyMinutesPerUnit ?? 0) + (partMinutes ?? 0);
    const [a] = await tx
      .insert(assemblies)
      .values({
        productId: i.productId,
        qtyMade: i.qty,
        assembledOn: i.assembledOn,
        unitCostUsd: unitCost,
        assemblyMinutesPerUnit: i.assemblyMinutesPerUnit,
        notes: i.notes,
      })
      .returning();
    for (const o of outs)
      await recordMovement(tx, {
        stockItemId: o.stockId,
        amount: o.amount,
        reason: "assembly_out",
        movedAt: now,
        assemblyId: a!.id,
      });
    await recordMovement(tx, {
      stockItemId: await stockFor(tx, i.productId),
      amount: i.qty,
      reason: "assembly_in",
      movedAt: now,
      assemblyId: a!.id,
      unitCostUsd: unitCost,
      labourMinutesPerUnit: minutes,
    });
    return a!;
  });
}

/** B-03: for an order's lines that still need printing, the parts an assembled product needs. */
export async function partsShortfall(db: Db, orderId: number) {
  const lines = await db
    .select({ productId: orderItems.productId, need: sql<number>`${orderItems.quantity} - ${orderItems.qtyReserved}` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orderItems.orderId, orderId),
        isNull(orderItems.deletedAt),
        sql`${orderItems.quantity} > ${orderItems.qtyReserved}`,
      ),
    );
  const out: { productId: number; partId: number; partName: string; needed: number; available: number }[] = [];
  for (const l of lines) {
    for (const p of await partsOf(db, l.productId)) {
      const [s] = await db
        .select({ id: stockItems.id })
        .from(stockItems)
        .where(and(eq(stockItems.productId, p.partId), isNull(stockItems.deletedAt)));
      const [a] = s ? await db.select().from(stockAvailable).where(eq(stockAvailable.stockItemId, s.id)) : [];
      out.push({
        productId: l.productId,
        partId: p.partId,
        partName: label(p),
        needed: Number(l.need) * p.qtyPerProduct,
        available: a?.available ?? 0,
      });
    }
  }
  return out;
}

// ── Stock screen and Change history

export async function stockList(db: Db) {
  const rows = await db
    .select({
      id: stockItems.id,
      name: stockItems.name,
      type: stockItems.type,
      unit: stockItems.unit,
      productId: stockItems.productId,
    })
    .from(stockItems)
    .where(isNull(stockItems.deletedAt))
    .orderBy(asc(stockItems.type), asc(stockItems.name));
  const avail = rows.length
    ? await db
        .select()
        .from(stockAvailable)
        .where(
          inArray(
            stockAvailable.stockItemId,
            rows.map((r) => r.id),
          ),
        )
    : [];
  return Promise.all(
    rows.map(async (r) => {
      const a = avail.find((x) => x.stockItemId === r.id);
      const avg = await currentAverage(db, r.id);
      const qty = a?.onHand ?? 0;
      return {
        ...r,
        onHand: qty,
        reserved: a?.reserved ?? 0,
        available: a?.available ?? 0,
        avgCostUsd: avg,
        valueUsd: avg == null ? null : avg * Math.max(0, qty),
      };
    }),
  );
}

export const HISTORY_TABLES: Record<string, string> = {
  expenses: "Expenses",
  machines: "Machines",
  suppliers: "Suppliers",
  products: "Products",
  product_parts: "Parts lists",
  recipes: "Recipes",
  print_jobs: "Prints",
  print_job_items: "Print items",
  print_job_filaments: "Print filament",
  stock_movements: "Stock movements",
  customers: "Customers",
  orders: "Orders",
  order_items: "Order items",
  payments: "Payments",
};

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

/** H-01: every logged change, newest first, optionally by table and date range (D13). */
export async function changeHistory(db: Db, f: { table?: string; from?: string; to?: string; limit?: number } = {}) {
  const rows = await db
    .select()
    .from(editLog)
    .where(
      and(
        f.table ? eq(editLog.tableName, f.table) : undefined,
        f.from ? gte(editLog.editedAt, new Date(`${f.from}T00:00:00+02:00`)) : undefined,
        f.to ? lte(editLog.editedAt, new Date(`${f.to}T23:59:59.999+02:00`)) : undefined,
      ),
    )
    .orderBy(desc(editLog.editedAt), desc(editLog.id))
    .limit(f.limit ?? 200);
  return rows.map((r) => ({
    ...r,
    href: LINKS[r.tableName] ? `${LINKS[r.tableName]}${r.rowId}` : null,
    tableLabel: HISTORY_TABLES[r.tableName] ?? r.tableName,
  }));
}
