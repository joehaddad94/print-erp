import { and, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import { stockItems } from "@/db/schema";
import { recordMovement } from "./ledger";

type Db = PostgresJsDatabase<typeof schema>;

export type NewStockItem = {
  type: "filament" | "packaging" | "other";
  material: string | null;
  color: string | null;
  name: string | null;
  reorderLevel: number | null;
  /** Opening count (grams for filament, pieces otherwise) and the price paid: per kg, or each. */
  quantity: number | null;
  price: number | null;
};

export class StockItemError extends Error {}

/**
 * New stock item (prototype /stock/new): something you already have, or will buy. An opening
 * count is a stock count at the price paid, not a purchase: no money is recorded.
 */
export async function createStockItem(db: Db, i: NewStockItem) {
  const filament = i.type === "filament";
  const name = (filament ? `${i.material} ${i.color}` : i.name!).replace(/\s+/g, " ").trim();
  return db.transaction(async (tx) => {
    const [dup] = await tx
      .select({ id: stockItems.id })
      .from(stockItems)
      .where(and(isNull(stockItems.deletedAt), sql`lower(${stockItems.name}) = lower(${name})`))
      .limit(1);
    if (dup) throw new StockItemError(`“${name}” is already in stock.`);
    const [item] = await tx
      .insert(stockItems)
      .values({
        name,
        type: filament ? "filament" : "consumable",
        unit: filament ? "grams" : "pieces",
        material: filament ? i.material : null,
        color: filament ? i.color : null,
        reorderLevel: i.reorderLevel,
      })
      .returning({ id: stockItems.id });
    if (i.quantity) {
      await recordMovement(tx, {
        stockItemId: item!.id,
        amount: i.quantity,
        reason: "count",
        unitCostUsd: filament ? i.price! / 1000 : i.price!,
      });
    }
    return { id: item!.id, name };
  });
}
