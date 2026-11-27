import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import {
  customers,
  editLog,
  orderItems,
  orders,
  productParts,
  products,
  recipeItems,
  recipes,
  stockItems,
  stockMovements,
} from "@/db/schema";
import { costInputs } from "@/server/calculator/service";
import { lastEdited } from "@/server/edits/engine";
import { recipeEstimate } from "@/server/recipes/estimate";

type Db = PostgresJsDatabase<typeof schema>;

export type ProductType = "product" | "assembled" | "part";

/**
 * Every product with what the Products table shows (prototype /products): type, price, cost each
 * (average cost in stock + packaging), stock, free, sold, last printed, packaging, current recipe.
 */
export async function productTable(db: Db) {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      variant: products.variant,
      kind: products.kind,
      salePriceUsd: products.salePriceUsd,
      packagingItemId: products.packagingItemId,
      packagingName: sql<string | null>`(select si.name from stock_items si where si.id = ${products.packagingItemId})`,
      packagingCostUsd: sql<
        number | null
      >`(select ac.avg_unit_cost_usd from stock_average_cost ac where ac.stock_item_id = ${products.packagingItemId})`.mapWith(
        (v) => (v == null ? null : Number(v)),
      ),
      stockItemId: stockItems.id,
      avgCostUsd: sql<
        number | null
      >`(select ac.avg_unit_cost_usd from stock_average_cost ac where ac.stock_item_id = ${stockItems.id})`.mapWith(
        (v) => (v == null ? null : Number(v)),
      ),
      onHand:
        sql<number>`coalesce((select sa.on_hand from stock_available sa where sa.stock_item_id = ${stockItems.id}), 0)`.mapWith(
          Number,
        ),
      reserved:
        sql<number>`coalesce((select sa.reserved from stock_available sa where sa.stock_item_id = ${stockItems.id}), 0)`.mapWith(
          Number,
        ),
      sold: sql<number>`coalesce((select sum(oi.quantity) from order_items oi join orders o on o.id = oi.order_id
        where oi.product_id = ${products.id} and oi.deleted_at is null and o.deleted_at is null and o.status = 'delivered'), 0)`.mapWith(
        Number,
      ),
      lastPrinted: sql<
        string | null
      >`(select max(pj.finished_at) from print_job_items pji join print_jobs pj on pj.id = pji.print_job_id
        where pji.product_id = ${products.id} and pj.deleted_at is null and pj.finished_at is not null and coalesce(pji.qty_good, 0) > 0)`,
      partCount:
        sql<number>`(select count(*) from product_parts pp where pp.product_id = ${products.id} and pp.deleted_at is null)`.mapWith(
          Number,
        ),
      recipeName: sql<
        string | null
      >`(select r.name || ' v' || r.version from recipe_items ri join recipes r on r.id = ri.recipe_id
        where ri.product_id = ${products.id} and ri.deleted_at is null and r.is_current and r.deleted_at is null
        order by r.uploaded_at desc limit 1)`,
      recipeCount: sql<number>`(select count(*) from recipe_items ri join recipes r on r.id = ri.recipe_id
        where ri.product_id = ${products.id} and ri.deleted_at is null and r.is_current and r.deleted_at is null)`.mapWith(
        Number,
      ),
    })
    .from(products)
    .leftJoin(stockItems, and(eq(stockItems.productId, products.id), isNull(stockItems.deletedAt)))
    .where(isNull(products.deletedAt))
    .orderBy(products.name, products.variant);
  const edited = await lastEdited(
    db,
    "products",
    rows.map((r) => r.id),
  );
  return rows.map((r) => {
    const type: ProductType = r.kind === "part" ? "part" : r.partCount > 0 ? "assembled" : "product";
    const costEachUsd =
      r.avgCostUsd == null ? null : r.avgCostUsd + (r.kind === "part" ? 0 : (r.packagingCostUsd ?? 0));
    return {
      ...r,
      type,
      costEachUsd,
      free: Math.max(0, r.onHand - r.reserved),
      lastPrinted: r.lastPrinted ? new Date(r.lastPrinted) : null,
      editedAt: edited.get(r.id) ?? null,
    };
  });
}

export type ProductRow = Awaited<ReturnType<typeof productTable>>[number];

/** Product page: the table row plus recipes that print it, orders it is reserved for, and its parts. */
export async function productDetail(db: Db, id: number) {
  const all = await productTable(db);
  const row = all.find((p) => p.id === id);
  if (!row) return null;
  const [printedBy, reservedFor, parts, inputs] = await Promise.all([
    db
      .select({
        recipeId: recipes.id,
        name: recipes.name,
        version: recipes.version,
        isCurrent: recipes.isCurrent,
        material: recipes.material,
        totalGrams: recipes.totalGrams,
        gramsOverride: recipes.gramsOverride,
        estimatedSeconds: recipes.estimatedSeconds,
        wasteAllowancePctOverride: recipes.wasteAllowancePctOverride,
        qtyOnPlate: recipeItems.qtyOnPlate,
        gramsPerPiece: recipeItems.gramsPerPiece,
      })
      .from(recipeItems)
      .innerJoin(recipes, eq(recipes.id, recipeItems.recipeId))
      .where(and(eq(recipeItems.productId, id), isNull(recipeItems.deletedAt), isNull(recipes.deletedAt)))
      .orderBy(desc(recipes.isCurrent), desc(recipes.version)),
    db
      .select({
        orderId: orders.id,
        customer: customers.name,
        dueOn: orders.dueOn,
        quantity: orderItems.quantity,
        reserved: orderItems.qtyReserved,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .where(
        and(
          eq(orderItems.productId, id),
          isNull(orderItems.deletedAt),
          isNull(orders.deletedAt),
          sql`${orders.status} not in ('delivered', 'cancelled')`,
        ),
      )
      .orderBy(sql`${orders.dueOn} asc nulls last`, orders.id),
    db
      .select({ id: productParts.id, partId: productParts.partId, qtyPerProduct: productParts.qtyPerProduct })
      .from(productParts)
      .where(and(eq(productParts.productId, id), isNull(productParts.deletedAt))),
    costInputs(db),
  ]);
  // Plate siblings, so a recipe's cost is split by weight across everything on the plate (D17).
  const recipeIds = [...new Set(printedBy.map((r) => r.recipeId))];
  const plate = recipeIds.length
    ? await db
        .select({
          recipeId: recipeItems.recipeId,
          productId: recipeItems.productId,
          qtyOnPlate: recipeItems.qtyOnPlate,
          gramsPerPiece: recipeItems.gramsPerPiece,
        })
        .from(recipeItems)
        .where(and(inArray(recipeItems.recipeId, recipeIds), isNull(recipeItems.deletedAt)))
        .orderBy(recipeItems.id)
    : [];
  const recipesOut = printedBy.map((r) => {
    const items = plate.filter((p) => p.recipeId === r.recipeId);
    const est = recipeEstimate(r, items, inputs);
    const k = items.findIndex((p) => p.productId === id);
    return { ...r, perPieceUsd: k >= 0 ? (est.perPiece[k] ?? null) : null };
  });
  const partRows = all.filter((p) => parts.some((x) => x.partId === p.id));
  return {
    ...row,
    printedBy: recipesOut,
    reservedFor,
    parts: parts.map((x) => ({ ...x, part: partRows.find((p) => p.id === x.partId) ?? null })),
  };
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  variant: "Variant",
  kind: "Type",
  sale_price_usd: "Price",
  packaging_item_id: "Packaging",
};

const money = (v: unknown) => (v == null || v === "" ? "—" : `$${Number(v).toFixed(2)}`);
const plain = (v: unknown) => (v == null || v === "" ? "—" : String(v));
const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

type MoveRow = {
  id: number;
  amount: number;
  reason: string;
  movedAt: Date;
  printJobId: number | null;
  unitCostUsd: number | null;
  orderId: number | null;
};

/**
 * Product page History (prototype): stock in and out of this product plus changes to its details,
 * newest first. Edits come from the edit log (D13), quantities from stock movements.
 */
export async function productActivity(db: Db, productId: number, stockItemId: number | null, limit = 12) {
  const [moves, edits, packaging] = await Promise.all([
    stockItemId == null
      ? Promise.resolve([] as MoveRow[])
      : db
          .select({
            id: stockMovements.id,
            amount: stockMovements.amount,
            reason: stockMovements.reason,
            movedAt: stockMovements.movedAt,
            printJobId: stockMovements.printJobId,
            unitCostUsd: stockMovements.unitCostUsd,
            orderId: orderItems.orderId,
          })
          .from(stockMovements)
          .leftJoin(orderItems, eq(orderItems.id, stockMovements.orderItemId))
          .where(and(eq(stockMovements.stockItemId, stockItemId), isNull(stockMovements.deletedAt)))
          .orderBy(desc(stockMovements.movedAt), desc(stockMovements.id))
          .limit(limit),
    db
      .select()
      .from(editLog)
      .where(and(eq(editLog.tableName, "products"), eq(editLog.rowId, productId)))
      .orderBy(desc(editLog.editedAt), desc(editLog.id))
      .limit(limit),
    db.select({ id: stockItems.id, name: stockItems.name }).from(stockItems),
  ]);
  const packName = (v: unknown) => packaging.find((p) => p.id === Number(v))?.name ?? "—";
  const out: { id: string; at: Date; text: string }[] = [];
  for (const m of moves) {
    const n = Math.round(Number(m.amount) * 1000) / 1000;
    const each = m.unitCostUsd != null ? `, ${money(m.unitCostUsd)} each` : "";
    const text =
      m.reason === "print"
        ? `${signed(n)} printed${m.printJobId ? ` (job #${m.printJobId})` : ""}${each}`
        : m.reason === "sale"
          ? `${signed(n)} delivered${m.orderId ? ` on #${m.orderId}` : ""}`
          : m.reason === "assembly_in"
            ? `${signed(n)} assembled${each}`
            : m.reason === "assembly_out"
              ? `${signed(n)} used to assemble a product`
              : m.reason === "purchase"
                ? `${signed(n)} bought${each}`
                : m.reason === "waste"
                  ? `${signed(n)} written off`
                  : `${signed(n)} stock adjusted`;
    out.push({ id: `m${m.id}`, at: m.movedAt, text });
  }
  for (const e of edits) {
    const label = FIELD_LABELS[e.field] ?? e.field.replace(/_/g, " ");
    const fmt = e.field === "sale_price_usd" ? money : e.field === "packaging_item_id" ? packName : plain;
    const text = e.action === "delete" ? "Deleted" : `${label} ${fmt(e.oldValue)} → ${fmt(e.newValue)}`;
    out.push({ id: `e${e.id}`, at: e.editedAt, text });
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
