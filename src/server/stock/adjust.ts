import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import { adjustments, editLog, stockItems } from "@/db/schema";
import { allocate } from "@/server/orders/allocate";
import { onHand, recordMovement } from "@/server/stock/ledger";

type Db = PostgresJsDatabase<typeof schema>;

export const ADJUST_REASONS = [
  "Weighed",
  "Counted",
  "Damaged or broken",
  "Lost",
  "Found",
  "Sample or gift",
  "Other",
] as const;

export class AdjustError extends Error {}

export type AdjustInput = {
  stockItemId: number;
  /** weigh = filament on the scale; count = you have N now; delta = add or remove N. */
  mode: "weigh" | "count" | "delta";
  scaleG?: number | null;
  emptySpoolG?: number | null;
  count?: number | null;
  delta?: number | null;
  reason: (typeof ADJUST_REASONS)[number];
  note: string | null;
};

/**
 * R6 Adjust stock (owner only): set what the app thinks you have. One adjustment row, one
 * movement (removed stock is written off at the average cost), one History line with the reason.
 * Pieces of a product that appear go to open orders (R4).
 */
export async function adjustStock(db: Db, i: AdjustInput, userId?: number, now = new Date()) {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(stockItems)
      .where(and(eq(stockItems.id, i.stockItemId), isNull(stockItems.deletedAt)));
    if (!item) throw new AdjustError("Choose a stock item.");
    const expected = await onHand(tx, item.id);
    let measured: number;
    if (i.mode === "weigh") {
      if (item.type !== "filament") throw new AdjustError("Weighing is for filament. Use New count.");
      if (i.scaleG == null || i.emptySpoolG == null)
        throw new AdjustError("Enter the scale reading and the empty spool.");
      measured = Math.max(0, i.scaleG - i.emptySpoolG);
    } else if (i.mode === "count") {
      if (i.count == null || i.count < 0) throw new AdjustError("Enter what you have now.");
      measured = i.count;
    } else {
      if (i.delta == null || i.delta === 0) throw new AdjustError("Enter how much to add or remove.");
      measured = expected + i.delta;
    }
    if (item.unit === "pieces" && !Number.isInteger(measured)) throw new AdjustError("Pieces are whole numbers.");
    const difference = measured - expected;
    if (Math.abs(difference) < 1e-9) throw new AdjustError("That is what the app already has. Nothing to change.");
    const reason = i.note ? `${i.reason} · ${i.note}` : i.reason;
    const [adj] = await tx
      .insert(adjustments)
      .values({
        type: i.mode === "weigh" ? "weigh_in" : "count",
        stockItemId: item.id,
        expected,
        measured,
        spoolsWeighed: i.mode === "weigh" ? 1 : null,
        difference,
        reason,
      })
      .returning();
    await recordMovement(tx, {
      stockItemId: item.id,
      amount: difference,
      reason: i.mode === "weigh" ? "weigh_in" : "count",
      movedAt: now,
      adjustmentId: adj!.id,
    });
    if (i.mode === "weigh" && item.emptySpoolWeightG !== i.emptySpoolG)
      await tx.update(stockItems).set({ emptySpoolWeightG: i.emptySpoolG }).where(eq(stockItems.id, item.id));
    await tx.insert(editLog).values({
      tableName: "stock_items",
      rowId: item.id,
      field: "on_hand",
      oldValue: expected,
      newValue: measured,
      reason,
      action: "edit",
      editedBy: userId ?? null,
      editedAt: now,
    });
    if (difference > 0 && item.productId != null) await allocate(tx, item.productId, userId);
    return { item: item.name, unit: item.unit, expected, measured, difference };
  });
}
