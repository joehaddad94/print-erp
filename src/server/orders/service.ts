import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import {
  customers,
  orderBalance,
  orderItems,
  orders,
  payments,
  products,
  stockAvailable,
  stockItems,
  stockMovements,
} from "@/db/schema";
import { lastEdited, softDeleteLogged, updateLogged, type Tx } from "@/server/edits/engine";
import { currentAverage, recordMovement } from "@/server/stock/ledger";
import { allocate } from "./allocate";

type Db = PostgresJsDatabase<typeof schema>;

export class OrderError extends Error {
  constructor(
    message: string,
    readonly link?: string,
  ) {
    super(message);
    this.name = "OrderError";
  }
}

export const ORDER_STATUSES = ["quoted", "confirmed", "printing", "ready", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const OPEN_STATUSES = ["quoted", "confirmed", "printing", "ready"] as const;
/** R4: the only statuses set by hand. "Ready" is worked out (every item reserved); delivered comes from Deliver. */
export const SETTABLE_STATUSES = ["quoted", "confirmed"] as const;
export type SettableStatus = (typeof SETTABLE_STATUSES)[number] | "cancelled";

/** R4 status shown to people: a confirmed order with every item reserved reads "Ready". */
export function shownStatus(o: { status: OrderStatus; needToPrint: number; lineCount?: number }): string {
  if (o.status === "confirmed" && o.needToPrint === 0 && (o.lineCount ?? 1) > 0) return "Ready";
  return STATUS_LABELS[o.status];
}
export const STATUS_LABELS: Record<OrderStatus, string> = {
  quoted: "Quoted",
  confirmed: "Confirmed",
  printing: "Printing",
  ready: "Ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
export const PAYMENT_STATE_LABELS = { unpaid: "Unpaid", partly_paid: "Partly paid", paid: "Paid" } as const;

// ───────────── Customers (D30) ─────────────

export type CustomerInput = {
  name: string;
  /** E.164 (see lib/phone). */
  phone: string | null;
  handle: string | null;
  notes: string | null;
  email?: string | null;
  area?: string | null;
  address?: string | null;
  mapUrl?: string | null;
};

export async function createCustomer(db: Db | Tx, i: CustomerInput) {
  const [c] = await db.insert(customers).values(i).returning({ id: customers.id });
  return c!.id;
}

export async function updateCustomer(db: Db, id: number, i: CustomerInput, userId?: number) {
  return db.transaction((tx) => updateLogged(tx, customers, id, i, { userId }));
}

/** A quote isn't owed yet (Joe, Nov 27): only confirmed, ready and delivered orders count. */
export const owesMoney = (o: { status: OrderStatus; balanceDueUsd: number }) =>
  o.status !== "cancelled" && o.status !== "quoted" && o.balanceDueUsd > 0.005;

/** Y-04: balance owed = sum of the balance due on their open and delivered orders. */
export async function listCustomers(db: Db) {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      handle: customers.handle,
      email: customers.email,
      area: customers.area,
      address: customers.address,
      mapUrl: customers.mapUrl,
      notes: customers.notes,
      orderCount: sql<number>`count(distinct ${orders.id})::int`,
      lastOrderAt: sql<string | null>`max(${orders.createdAt})`,
      balanceOwedUsd: sql<string>`coalesce(sum(${orderBalance.balanceDueUsd}) filter (where ${orders.status} not in ('cancelled', 'quoted')), 0)`,
    })
    .from(customers)
    .leftJoin(orders, and(eq(orders.customerId, customers.id), isNull(orders.deletedAt)))
    .leftJoin(orderBalance, eq(orderBalance.orderId, orders.id))
    .where(isNull(customers.deletedAt))
    .groupBy(customers.id)
    .orderBy(asc(customers.name));
  return rows.map((r) => ({ ...r, balanceOwedUsd: Number(r.balanceOwedUsd) }));
}

export async function getCustomer(db: Db, id: number) {
  const [c] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)));
  if (!c) return null;
  const list = await listOrders(db, { customerId: id, newestFirst: true });
  const owing = list.filter((o) => owesMoney(o));
  const owed = owing.reduce((s, o) => s + o.balanceDueUsd, 0);
  const delivered = list.filter((o) => o.status === "delivered");
  // R5: profit on delivered orders, items only (D37), the same sum the order page shows.
  const [p] = await db.execute<{ profit: string | null }>(sql`
    select sum(oi.quantity * (oi.unit_price * o.rate_to_usd - coalesce(oi.unit_cost_usd, 0)
             - coalesce(oi.packaging_cost_per_unit_usd, 0))) as profit
    from orders o join order_items oi on oi.order_id = o.id and oi.deleted_at is null
    where o.customer_id = ${id} and o.deleted_at is null and o.status = 'delivered'`);
  const open = list
    .filter((o) => !["delivered", "cancelled"].includes(o.status))
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  return {
    ...c,
    orders: list,
    balanceOwedUsd: owed,
    owingOrders: owing.length,
    deliveredUsd: delivered.reduce((s, o) => s + o.totalUsd, 0),
    deliveredCount: delivered.length,
    profitUsd: Number(p?.profit ?? 0),
    openOrders: open,
  };
}

// ───────────── Orders (D18, D21, D28, D35, D37, D45) ─────────────

export type OrderInput = {
  channel: "whatsapp" | "instagram" | "in_person" | "other";
  customerId: number | null;
  newCustomerName: string | null;
  dueOn: string | null;
  currency: "USD" | "LBP";
  rateToUsd: number;
  deliveryCharge: number | null;
  deliveredBy: string | null;
  /** Null = deliver to the customer's saved address. */
  deliveryAddress?: string | null;
  notes: string | null;
};

export async function createOrder(db: Db, i: OrderInput) {
  return db.transaction(async (tx) => {
    const customerId =
      i.customerId ??
      (i.newCustomerName
        ? await createCustomer(tx, { name: i.newCustomerName, phone: null, handle: null, notes: null })
        : null);
    const [o] = await tx
      .insert(orders)
      .values({
        channel: i.channel,
        customerId,
        dueOn: i.dueOn,
        currency: i.currency,
        rateToUsd: i.rateToUsd,
        deliveryCharge: i.deliveryCharge,
        deliveredBy: i.deliveredBy,
        notes: i.notes,
      })
      .returning({ id: orders.id });
    return o!.id;
  });
}

export async function updateOrder(db: Db, id: number, i: OrderInput, userId?: number) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, id);
    if (i.currency !== o.currency) {
      const [n] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(orderItems)
        .where(and(eq(orderItems.orderId, id), isNull(orderItems.deletedAt)));
      if (n!.n > 0)
        throw new OrderError(`The items are priced in ${o.currency}. Remove them before changing the currency.`);
    }
    const customerId =
      i.customerId ??
      (i.newCustomerName
        ? await createCustomer(tx, { name: i.newCustomerName, phone: null, handle: null, notes: null })
        : null);
    return updateLogged(
      tx,
      orders,
      id,
      {
        channel: i.channel,
        customerId,
        dueOn: i.dueOn,
        currency: i.currency,
        rateToUsd: i.rateToUsd,
        deliveryCharge: i.deliveryCharge,
        deliveredBy: i.deliveredBy,
        ...(i.deliveryAddress === undefined ? {} : { deliveryAddress: i.deliveryAddress }),
        notes: i.notes,
      },
      { userId },
    );
  });
}

export async function listOrders(db: Db, filter: { customerId?: number; newestFirst?: boolean } = {}) {
  const rows = await db
    .select({
      id: orders.id,
      status: orders.status,
      channel: orders.channel,
      dueOn: orders.dueOn,
      createdAt: orders.createdAt,
      customerName: customers.name,
      totalUsd: orderBalance.totalUsd,
      balanceDueUsd: orderBalance.balanceDueUsd,
      paymentState: orderBalance.paymentState,
      needToPrint: sql<number>`(select coalesce(sum(oi.quantity - oi.qty_reserved), 0)::int from order_items oi
        where oi.order_id = "orders"."id" and oi.deleted_at is null)`,
      lineCount: sql<number>`(select count(*)::int from order_items oi
        where oi.order_id = "orders"."id" and oi.deleted_at is null)`,
      itemsText: sql<string | null>`(select string_agg(oi.quantity || ' × ' || p.name, ', ' order by oi.id)
        from order_items oi join products p on p.id = oi.product_id
        where oi.order_id = "orders"."id" and oi.deleted_at is null)`,
    })
    .from(orders)
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(orderBalance, eq(orderBalance.orderId, orders.id))
    .where(and(isNull(orders.deletedAt), filter.customerId ? eq(orders.customerId, filter.customerId) : undefined))
    .orderBy(
      ...(filter.newestFirst
        ? [desc(orders.createdAt), desc(orders.id)]
        : [
            sql`case when ${orders.status} in ('delivered','cancelled') then 1 else 0 end`,
            asc(orders.dueOn),
            desc(orders.id),
          ]),
    );
  const edited = await lastEdited(
    db,
    "orders",
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({ ...r, editedAt: edited.get(r.id) ?? null }));
}

async function lockOrder(tx: Tx, id: number) {
  const [o] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), isNull(orders.deletedAt)))
    .for("update");
  if (!o) throw new OrderError("That order no longer exists.");
  return o;
}

function assertOpen(o: { status: OrderStatus }) {
  if (o.status === "delivered") throw new OrderError("This order is delivered. Its lines can't change.");
  if (o.status === "cancelled") throw new OrderError("This order is cancelled.");
}

export type LineInput = { productId: number; quantity: number; unitPrice: number | null; customization: string | null };

/** O-01/D31: only products with a sale price; the price is pre-filled and may be changed, even to $0 (D45). */
export async function addLine(db: Db, orderId: number, i: LineInput) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    assertOpen(o);
    const [p] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, i.productId), isNull(products.deletedAt)));
    if (!p) throw new OrderError("Choose a product.");
    if (p.kind === "part") throw new OrderError("A part can't be sold on its own.");
    if (p.salePriceUsd == null) throw new OrderError("Set a sale price for this product first", `/products/${p.id}`);
    const unitPrice = i.unitPrice ?? p.salePriceUsd / o.rateToUsd;
    const [line] = await tx
      .insert(orderItems)
      .values({ orderId, productId: p.id, quantity: i.quantity, unitPrice, customization: i.customization })
      .returning({ id: orderItems.id });
    if (o.status === "confirmed") await reserveLines(tx, orderId);
    return line!.id;
  });
}

export async function updateLine(db: Db, lineId: number, i: Omit<LineInput, "productId">, userId?: number) {
  return db.transaction(async (tx) => {
    const [line] = await tx.select().from(orderItems).where(eq(orderItems.id, lineId));
    if (!line || line.deletedAt) throw new OrderError("That line no longer exists.");
    const o = await lockOrder(tx, line.orderId);
    assertOpen(o);
    const changed = await updateLogged(
      tx,
      orderItems,
      lineId,
      {
        quantity: i.quantity,
        unitPrice: i.unitPrice ?? line.unitPrice,
        customization: i.customization,
        qtyReserved: Math.min(line.qtyReserved, i.quantity),
      },
      { userId },
    );
    // Fewer pieces: the freed ones go to the next order. More: this order takes what's free.
    if (i.quantity < line.qtyReserved) await allocate(tx, line.productId, userId);
    if (o.status === "confirmed") await reserveLines(tx, line.orderId, userId);
    return changed;
  });
}

export async function deleteLine(db: Db, lineId: number, userId?: number) {
  return db.transaction(async (tx) => {
    const [line] = await tx.select().from(orderItems).where(eq(orderItems.id, lineId));
    if (!line || line.deletedAt) return;
    assertOpen(await lockOrder(tx, line.orderId));
    await softDeleteLogged(tx, orderItems, lineId, { userId });
    if (line.qtyReserved > 0) await allocate(tx, line.productId, userId);
  });
}

async function productStockId(tx: Tx | Db, productId: number) {
  const [s] = await tx
    .select({ id: stockItems.id })
    .from(stockItems)
    .where(and(eq(stockItems.productId, productId), isNull(stockItems.deletedAt)));
  return s?.id ?? null;
}

/**
 * O-03/D21: reserve what's available for each line, up to what it still needs.
 * On hand is unchanged; available drops; the rest shows as "need to print N".
 */
export async function reserve(db: Db, orderId: number, userId?: number) {
  return db.transaction(async (tx) => {
    assertOpen(await lockOrder(tx, orderId));
    return reserveLines(tx, orderId, userId);
  });
}

async function reserveLines(tx: Tx, orderId: number, userId?: number) {
  {
    const lines = await tx
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)))
      .orderBy(asc(orderItems.id));
    let reserved = 0;
    for (const line of lines) {
      const need = line.quantity - line.qtyReserved;
      if (need <= 0) continue;
      const stockId = await productStockId(tx, line.productId);
      if (stockId == null) continue;
      // Lock the item's movements so two reservations can't take the same pieces.
      await tx.execute(sql`select pg_advisory_xact_lock(${stockId})`);
      const [a] = await tx.select().from(stockAvailable).where(eq(stockAvailable.stockItemId, stockId));
      const take = Math.max(0, Math.min(need, Math.floor(a?.available ?? 0)));
      if (take > 0) {
        await updateLogged(
          tx,
          orderItems,
          line.id,
          { qtyReserved: line.qtyReserved + take },
          { userId, reason: "reserve" },
        );
        reserved += take;
      }
    }
    return reserved;
  }
}

/**
 * R4: Quoted holds no stock; Confirmed reserves what's free right away. Cancel or back to Quoted
 * releases its pieces to the next order due (O-06).
 */
export async function setStatus(db: Db, orderId: number, status: SettableStatus, userId?: number) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.status === "delivered") throw new OrderError("A delivered order can't change status.");
    await updateLogged(tx, orders, orderId, { status }, { userId });
    if (status === "confirmed") await reserveLines(tx, orderId, userId);
    else await releaseAll(tx, orderId, userId);
  });
}

/**
 * R4 "Take N from #order": move reserved pieces of the same product from another open order
 * (usually one due later) to this line. Returns how many moved.
 */
export async function takeFrom(db: Db, lineId: number, fromLineId: number, userId?: number) {
  return db.transaction(async (tx) => {
    const [to] = await tx.select().from(orderItems).where(eq(orderItems.id, lineId));
    const [from] = await tx.select().from(orderItems).where(eq(orderItems.id, fromLineId));
    if (!to || to.deletedAt || !from || from.deletedAt) throw new OrderError("That item no longer exists.");
    if (to.productId !== from.productId || to.orderId === from.orderId)
      throw new OrderError("Pieces can only move between orders of the same product.");
    const [a, b] = to.orderId < from.orderId ? [to.orderId, from.orderId] : [from.orderId, to.orderId];
    const first = await lockOrder(tx, a);
    const second = await lockOrder(tx, b);
    for (const o of [first, second]) assertOpen(o);
    const n = Math.min(to.quantity - to.qtyReserved, from.qtyReserved);
    if (n <= 0) return 0;
    await updateLogged(
      tx,
      orderItems,
      from.id,
      { qtyReserved: from.qtyReserved - n },
      { userId, reason: `moved to #${to.orderId}` },
    );
    await updateLogged(
      tx,
      orderItems,
      to.id,
      { qtyReserved: to.qtyReserved + n },
      { userId, reason: `taken from #${from.orderId}` },
    );
    return n;
  });
}

/** R4: for each line still short, the other open order holding the most reserved pieces of it, due last. */
export async function donorsFor(db: Db, orderId: number) {
  const rows = await db
    .select({
      toLineId: sql<number>`t.id`,
      fromLineId: orderItems.id,
      fromOrderId: orderItems.orderId,
      dueOn: orders.dueOn,
      reserved: orderItems.qtyReserved,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(
      sql`order_items t`,
      sql`t.product_id = ${orderItems.productId} and t.order_id = ${orderId} and t.deleted_at is null and t.quantity > t.qty_reserved`,
    )
    .where(
      and(
        isNull(orderItems.deletedAt),
        isNull(orders.deletedAt),
        sql`${orderItems.orderId} <> ${orderId}`,
        sql`${orderItems.qtyReserved} > 0`,
        inArray(orders.status, ["quoted", "confirmed", "printing", "ready"]),
      ),
    )
    .orderBy(sql`${orders.dueOn} desc nulls first`, desc(orders.id));
  const out = new Map<number, { fromLineId: number; fromOrderId: number; dueOn: string | null; reserved: number }>();
  for (const { toLineId, ...r } of rows) if (!out.has(Number(toLineId))) out.set(Number(toLineId), r);
  return out;
}

async function releaseAll(tx: Tx, orderId: number, userId?: number) {
  const lines = await tx
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)));
  for (const l of lines)
    if (l.qtyReserved > 0) await updateLogged(tx, orderItems, l.id, { qtyReserved: 0 }, { userId, reason: "release" });
  for (const productId of new Set(lines.filter((l) => l.qtyReserved > 0).map((l) => l.productId)))
    await allocate(tx, productId, userId);
}

export async function deleteOrder(db: Db, orderId: number, userId?: number) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.status === "delivered") throw new OrderError("A delivered order can't be deleted. Its stock has left.");
    await softDeleteLogged(tx, orders, orderId, { userId });
    await releaseAll(tx, orderId, userId);
  });
}

/** Latest hands-on minutes per unit that came in with this stock (D24). */
async function labourMinutes(tx: Tx | Db, stockId: number) {
  const [m] = await tx
    .select({ v: stockMovements.labourMinutesPerUnit })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.stockItemId, stockId),
        isNull(stockMovements.deletedAt),
        sql`${stockMovements.amount} > 0`,
        sql`${stockMovements.labourMinutesPerUnit} is not null`,
      ),
    )
    .orderBy(desc(stockMovements.movedAt), desc(stockMovements.id))
    .limit(1);
  return m?.v ?? null;
}

/**
 * Deliver whole order (D35, D36, D38, O-05): only when every line is fully reserved. In one
 * transaction: −stock per line at the weighted average, −1 packaging per unit, and each line
 * snapshots unit cost, packaging cost and labour minutes.
 */
export async function deliver(
  db: Db,
  orderId: number,
  i: { deliveredBy: string | null; deliveryCharge: number | null },
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    assertOpen(o);
    const lines = await tx
      .select({ line: orderItems, product: products })
      .from(orderItems)
      .innerJoin(products, eq(products.id, orderItems.productId))
      .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)));
    if (lines.length === 0) throw new OrderError("Add at least one line first.");
    const short = lines.filter((l) => l.line.qtyReserved < l.line.quantity);
    if (short.length)
      throw new OrderError("Every line must be fully reserved before delivery. Print or reserve the rest.");

    for (const { line, product } of lines) {
      const stockId = (await productStockId(tx, product.id))!;
      const unitCostUsd = (await currentAverage(tx, stockId)) ?? 0;
      let packagingCost: number | null = null;
      if (product.packagingItemId != null) {
        packagingCost = (await currentAverage(tx, product.packagingItemId)) ?? 0;
        await recordMovement(tx, {
          stockItemId: product.packagingItemId,
          amount: -line.quantity,
          reason: "sale",
          movedAt: now,
          orderItemId: line.id,
        });
      }
      const minutes = await labourMinutes(tx, stockId);
      await recordMovement(tx, {
        stockItemId: stockId,
        amount: -line.quantity,
        reason: "sale",
        movedAt: now,
        orderItemId: line.id,
        unitCostUsd,
      });
      await tx
        .update(orderItems)
        .set({ unitCostUsd, packagingCostPerUnitUsd: packagingCost, labourMinutesPerUnit: minutes, updatedAt: now })
        .where(eq(orderItems.id, line.id));
    }
    await tx
      .update(orders)
      .set({
        status: "delivered",
        deliveredAt: now,
        deliveredBy: i.deliveredBy ?? o.deliveredBy,
        deliveryCharge: i.deliveryCharge ?? o.deliveryCharge,
        updatedAt: now,
      })
      .where(eq(orders.id, orderId));
  });
}

// ───────────── Payments (D28, D43) ─────────────

export type PaymentInput = {
  paidOn: string;
  amount: number;
  currency: "USD" | "LBP";
  rateToUsd: number;
  method: (typeof payments.$inferInsert)["method"] & string;
  collectedBy: string | null;
  reference: string | null;
  notes: string | null;
};

/** A refund is a negative amount. Courier COD stays "held by courier" until Mark received (Y-02). */
export async function recordPayment(db: Db, orderId: number, i: PaymentInput, now = new Date()) {
  const [o] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)));
  if (!o) throw new OrderError("That order no longer exists.");
  const [p] = await db
    .insert(payments)
    .values({ orderId, ...i, receivedAt: i.method === "courier_cod" ? null : now })
    .returning({ id: payments.id });
  return p!.id;
}

export async function markReceived(db: Db, paymentId: number, userId?: number, now = new Date()) {
  return db.transaction((tx) =>
    updateLogged(tx, payments, paymentId, { receivedAt: now }, { userId, reason: "received" }),
  );
}

export async function deletePayment(db: Db, paymentId: number, userId?: number) {
  return db.transaction((tx) => softDeleteLogged(tx, payments, paymentId, { userId }));
}

// ───────────── Order page ─────────────

export async function getOrder(db: Db, id: number) {
  const [row] = await db
    .select({
      order: orders,
      customer: customers,
      balance: {
        totalUsd: orderBalance.totalUsd,
        receivedUsd: orderBalance.receivedUsd,
        heldByCourierUsd: orderBalance.heldByCourierUsd,
        balanceDueUsd: orderBalance.balanceDueUsd,
        paymentState: orderBalance.paymentState,
      },
    })
    .from(orders)
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(orderBalance, eq(orderBalance.orderId, orders.id))
    .where(and(eq(orders.id, id), isNull(orders.deletedAt)));
  if (!row) return null;
  const [lines, pays] = await Promise.all([
    db
      .select({ line: orderItems, productName: products.name, productVariant: products.variant })
      .from(orderItems)
      .innerJoin(products, eq(products.id, orderItems.productId))
      .where(and(eq(orderItems.orderId, id), isNull(orderItems.deletedAt)))
      .orderBy(asc(orderItems.id)),
    db
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, id), isNull(payments.deletedAt)))
      .orderBy(asc(payments.paidOn), asc(payments.id)),
  ]);
  const stockIds = new Map<number, number | null>();
  for (const l of lines) stockIds.set(l.line.productId, await productStockId(db, l.line.productId));
  const ids = [...stockIds.values()].filter((v): v is number => v != null);
  const avail = ids.length
    ? await db.select().from(stockAvailable).where(inArray(stockAvailable.stockItemId, ids))
    : [];
  const availFor = (productId: number) => avail.find((a) => a.stockItemId === stockIds.get(productId))?.available ?? 0;

  const delivered = row.order.status === "delivered";
  const r = row.order.rateToUsd;
  const profitLines = lines.map(({ line }) => {
    if (!delivered || line.unitCostUsd == null) return null;
    const profit = line.quantity * (line.unitPrice * r - line.unitCostUsd - (line.packagingCostPerUnitUsd ?? 0));
    const minutes = line.labourMinutesPerUnit == null ? null : line.labourMinutesPerUnit * line.quantity;
    return { profit, minutes };
  });
  // Open orders: an estimate from today's average cost, packaging and hands-on minutes (D24).
  const open = (OPEN_STATUSES as readonly string[]).includes(row.order.status);
  const estLines = open
    ? await Promise.all(
        lines.map(async ({ line }) => {
          const stockId = stockIds.get(line.productId);
          if (stockId == null) return null;
          const cost = await currentAverage(db, stockId);
          if (cost == null) return null;
          const [pk] = await db
            .select({ id: products.packagingItemId })
            .from(products)
            .where(eq(products.id, line.productId));
          const pack = pk?.id != null ? ((await currentAverage(db, pk.id)) ?? 0) : 0;
          const m = await labourMinutes(db, stockId);
          return {
            profit: line.quantity * (line.unitPrice * r - cost - pack),
            minutes: m == null ? null : m * line.quantity,
          };
        }),
      )
    : [];
  const estimated = open && lines.length > 0 && estLines.every((p) => p != null);
  const used = delivered ? profitLines : estimated ? estLines : [];
  const profitUsd = delivered || estimated ? used.reduce((s, p) => s + (p?.profit ?? 0), 0) : null;
  const minutes =
    used.length && used.every((p) => p?.minutes != null) ? used.reduce((s, p) => s + (p?.minutes ?? 0), 0) : null;
  return {
    ...row.order,
    customer: row.customer,
    balance: row.balance,
    lines: lines.map((l) => ({
      ...l.line,
      productName: l.productName,
      productVariant: l.productVariant,
      available: availFor(l.line.productId),
      needToPrint: l.line.quantity - l.line.qtyReserved,
    })),
    payments: pays,
    fullyReserved: lines.length > 0 && lines.every((l) => l.line.qtyReserved >= l.line.quantity),
    profitUsd,
    /** True while the order is open: profit is an estimate from today's costs. */
    profitEstimated: !delivered && profitUsd != null,
    /** D24: profit per hour of your time; null ("—") when any line has no minutes. */
    profitPerHourUsd: profitUsd != null && minutes ? profitUsd / (minutes / 60) : null,
  };
}

export type Order = NonNullable<Awaited<ReturnType<typeof getOrder>>>;

export function sellableProducts(db: Db) {
  return db
    .select({ id: products.id, name: products.name, variant: products.variant, salePriceUsd: products.salePriceUsd })
    .from(products)
    .where(and(eq(products.kind, "product"), isNull(products.deletedAt)))
    .orderBy(asc(products.name));
}

/**
 * New order (prototype /orders/new): the order and its items in one save. Quoted holds no stock;
 * Confirmed reserves what's free right away and the rest shows as "need to print" (R4, D21).
 */
export async function createOrderWithLines(
  db: Db,
  i: OrderInput & { status: "quoted" | "confirmed" },
  lines: { productId: number; quantity: number; unitPrice: number | null }[],
) {
  return db.transaction(async (tx) => {
    const customerId =
      i.customerId ??
      (i.newCustomerName
        ? await createCustomer(tx, { name: i.newCustomerName, phone: null, handle: null, notes: null })
        : null);
    const [o] = await tx
      .insert(orders)
      .values({
        channel: i.channel,
        customerId,
        dueOn: i.dueOn,
        currency: i.currency,
        rateToUsd: i.rateToUsd,
        deliveryCharge: i.deliveryCharge,
        deliveredBy: i.deliveredBy,
        notes: i.notes,
        status: i.status,
      })
      .returning({ id: orders.id });
    for (const l of lines) {
      const [p] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, l.productId), isNull(products.deletedAt)));
      if (!p) throw new OrderError("One of the items was deleted. Remove it and try again.");
      if (p.kind === "part") throw new OrderError(`${p.name} is a part and can't be sold on its own.`);
      if (p.salePriceUsd == null) throw new OrderError(`Set a sale price for ${p.name} first`, `/products/${p.id}`);
      await tx.insert(orderItems).values({
        orderId: o!.id,
        productId: p.id,
        quantity: l.quantity,
        unitPrice: l.unitPrice ?? p.salePriceUsd / i.rateToUsd,
        customization: null,
      });
    }
    if (i.status === "confirmed") await reserveLines(tx, o!.id);
    return o!.id;
  });
}
