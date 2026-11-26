import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { orderItems, orders, stockAvailable, stockItems } from "@/db/schema";
import { updateLogged, type Tx } from "@/server/edits/engine";

/**
 * R4 auto-reserve: hand the free pieces of one product to open confirmed orders, the order due
 * soonest first (no due date last, then oldest order). Runs when pieces come in (a print finishes,
 * an assembly) or are freed (a line shrinks, an order is cancelled or goes back to quoted).
 * Returns how many pieces were reserved.
 */
export async function allocate(tx: Tx, productId: number, userId?: number): Promise<number> {
  const [s] = await tx
    .select({ id: stockItems.id })
    .from(stockItems)
    .where(and(eq(stockItems.productId, productId), isNull(stockItems.deletedAt)));
  if (!s) return 0;
  // Same lock as reserve(): two reservations can't take the same pieces.
  await tx.execute(sql`select pg_advisory_xact_lock(${s.id})`);
  const [a] = await tx.select().from(stockAvailable).where(eq(stockAvailable.stockItemId, s.id));
  let free = Math.floor(a?.available ?? 0);
  if (free <= 0) return 0;
  const lines = await tx
    .select({ id: orderItems.id, quantity: orderItems.quantity, qtyReserved: orderItems.qtyReserved })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orderItems.productId, productId),
        isNull(orderItems.deletedAt),
        isNull(orders.deletedAt),
        eq(orders.status, "confirmed"),
        gt(orderItems.quantity, orderItems.qtyReserved),
      ),
    )
    .orderBy(sql`${orders.dueOn} asc nulls last`, asc(orders.id), asc(orderItems.id));
  let given = 0;
  for (const l of lines) {
    if (free <= 0) break;
    const take = Math.min(free, l.quantity - l.qtyReserved);
    await updateLogged(tx, orderItems, l.id, { qtyReserved: l.qtyReserved + take }, { userId, reason: "reserve" });
    free -= take;
    given += take;
  }
  return given;
}
