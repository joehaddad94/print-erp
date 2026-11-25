import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { stockItems, stockMovements } from "@/db/schema";
import { currentAverage, onHand, recordMovement, replayAverages } from "@/server/stock/ledger";
import { setupTestDb } from "./helpers";

const { db, client } = setupTestDb();

async function filament() {
  const [f] = await db.insert(stockItems).values({ name: "PLA Black", type: "filament", unit: "grams" }).returning();
  return f!.id;
}

describe("weighted average ledger (D23, D38)", () => {
  it("C-12/C-13 in the database: purchases, use, purchase", async () => {
    const id = await filament();
    await db.transaction(async (tx) => {
      await recordMovement(tx, { stockItemId: id, amount: 1000, reason: "purchase", unitCostUsd: 0.017 });
      await recordMovement(tx, { stockItemId: id, amount: 1000, reason: "purchase", unitCostUsd: 0.018 });
    });
    expect(await currentAverage(db, id)).toBeCloseTo(0.0175, 10);
    await db.transaction(async (tx) => {
      await recordMovement(tx, { stockItemId: id, amount: -1500, reason: "print" });
      await recordMovement(tx, { stockItemId: id, amount: 1000, reason: "purchase", unitCostUsd: 0.02 });
    });
    expect(await onHand(db, id)).toBe(1500);
    expect(await currentAverage(db, id)).toBeCloseTo(0.0191667, 7);
    const [view] = await client<
      { avg_unit_cost_usd: string }[]
    >`select avg_unit_cost_usd from stock_average_cost where stock_item_id = ${id}`;
    expect(Number(view!.avg_unit_cost_usd)).toBeCloseTo(0.0191667, 7);
  });

  it("E-03 (engine part) editing a past purchase and replaying fixes later averages", async () => {
    const id = await filament();
    let first = 0;
    await db.transaction(async (tx) => {
      first = (
        await recordMovement(tx, {
          stockItemId: id,
          amount: 1000,
          reason: "purchase",
          unitCostUsd: 0.017,
          movedAt: new Date("2026-11-01"),
        })
      ).id;
      await recordMovement(tx, {
        stockItemId: id,
        amount: 1000,
        reason: "purchase",
        unitCostUsd: 0.018,
        movedAt: new Date("2026-11-02"),
      });
    });
    await db.transaction(async (tx) => {
      await tx.update(stockMovements).set({ unitCostUsd: 0.016 }).where(eq(stockMovements.id, first));
      await replayAverages(tx, id);
    });
    expect(await currentAverage(db, id)).toBeCloseTo(0.017, 10);
    await db.transaction(async (tx) => {
      await tx
        .update(stockMovements)
        .set({ deletedAt: sql`now()` })
        .where(eq(stockMovements.id, first));
      await replayAverages(tx, id);
    });
    expect(await currentAverage(db, id)).toBeCloseTo(0.018, 10);
    expect(await onHand(db, id)).toBe(1000);
  });

  it("a movement that fails mid-transaction leaves nothing behind", async () => {
    const id = await filament();
    await expect(
      db.transaction(async (tx) => {
        await recordMovement(tx, { stockItemId: id, amount: 1000, reason: "purchase", unitCostUsd: 0.017 });
        await recordMovement(tx, { stockItemId: id, amount: 5, reason: "purchase" }); // violates: + without cost
      }),
    ).rejects.toThrow();
    expect(await onHand(db, id)).toBe(0);
  });
});
