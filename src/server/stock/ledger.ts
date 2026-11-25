import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { weightedAverage } from "@/lib/cost";
import type * as schema from "@/db/schema";
import { stockMovements } from "@/db/schema";

type Db = PostgresJsDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type NewMovement = typeof stockMovements.$inferInsert;

/** On hand right now for one item (sum of non-deleted movements). */
export async function onHand(tx: Db | Tx, stockItemId: number): Promise<number> {
  const [row] = await tx
    .select({ q: sql<string>`coalesce(sum(${stockMovements.amount}), 0)` })
    .from(stockMovements)
    .where(and(eq(stockMovements.stockItemId, stockItemId), isNull(stockMovements.deletedAt)));
  return Number(row!.q);
}

/** Latest weighted average for an item, or null if it never had a costed stock-in. */
export async function currentAverage(tx: Db | Tx, stockItemId: number): Promise<number | null> {
  const [row] = await tx
    .select({ avg: stockMovements.avgUnitCostAfterUsd })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.stockItemId, stockItemId),
        isNull(stockMovements.deletedAt),
        isNotNull(stockMovements.avgUnitCostAfterUsd),
      ),
    )
    .orderBy(desc(stockMovements.movedAt), desc(stockMovements.id))
    .limit(1);
  return row?.avg ?? null;
}

/**
 * Writes one movement. A costed stock-in (+amount with unit cost) updates the weighted
 * average (D23, D38); everything else carries the current average forward unchanged.
 * Call inside the transaction that writes the business row (purchase, print, sale…).
 */
export async function recordMovement(tx: Tx, m: NewMovement) {
  const before = await onHand(tx, m.stockItemId);
  const avg = await currentAverage(tx, m.stockItemId);
  const isCostedIn = m.amount > 0 && m.unitCostUsd != null;
  const avgAfter = isCostedIn ? weightedAverage(before, avg, m.amount, m.unitCostUsd!) : avg;
  const [row] = await tx
    .insert(stockMovements)
    .values({ ...m, avgUnitCostAfterUsd: avgAfter })
    .returning();
  return row!;
}

/**
 * Plan §3.10: after an edit or delete of a past movement, replay the item's averages
 * in time order so every later movement's average is right again.
 */
export async function replayAverages(tx: Tx, stockItemId: number) {
  const rows = await tx
    .select()
    .from(stockMovements)
    .where(and(eq(stockMovements.stockItemId, stockItemId), isNull(stockMovements.deletedAt)))
    .orderBy(asc(stockMovements.movedAt), asc(stockMovements.id));
  let qty = 0;
  let avg: number | null = null;
  for (const r of rows) {
    if (r.amount > 0 && r.unitCostUsd != null) avg = weightedAverage(qty, avg, r.amount, r.unitCostUsd);
    qty += r.amount;
    if (r.avgUnitCostAfterUsd !== avg) {
      await tx.update(stockMovements).set({ avgUnitCostAfterUsd: avg }).where(eq(stockMovements.id, r.id));
    }
  }
}
