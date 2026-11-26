import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { adjustments, editLog, orderItems, products, stockItems } from "@/db/schema";
import { setPassword } from "@/server/auth/service";
import { historyFeed } from "@/server/history/service";
import { addLine, createOrder } from "@/server/orders/service";
import { adjustStock, AdjustError } from "@/server/stock/adjust";
import { currentAverage, onHand, recordMovement } from "@/server/stock/ledger";
import { setupTestDb } from "./helpers";

const { db } = setupTestDb();

let pla: number;
let clip: number;
let clipStock: number;
beforeEach(async () => {
  const [f] = await db
    .insert(stockItems)
    .values({ name: "PLA Black", type: "filament", unit: "grams", emptySpoolWeightG: 200 })
    .returning();
  pla = f!.id;
  const [p] = await db.insert(products).values({ name: "Clip", salePriceUsd: 2 }).returning();
  clip = p!.id;
  const [s] = await db
    .insert(stockItems)
    .values({ name: "Clip", type: "finished_product", unit: "pieces", productId: clip })
    .returning();
  clipStock = s!.id;
  await db.transaction(async (tx) => {
    await recordMovement(tx, { stockItemId: pla, amount: 180, reason: "purchase", unitCostUsd: 0.0175 });
    await recordMovement(tx, { stockItemId: clipStock, amount: 2, reason: "print", unitCostUsd: 0.5 });
  });
});

describe("R6 Adjust stock", () => {
  it("weigh the spool: 412 g on the scale, 250 g empty → 162 g, written off at the average, in History", async () => {
    const joe = await setPassword(db, "joe", "correct horse battery");
    const r = await adjustStock(
      db,
      { stockItemId: pla, mode: "weigh", scaleG: 412, emptySpoolG: 250, reason: "Weighed", note: "Monthly check" },
      joe,
    );
    expect(r).toMatchObject({ expected: 180, measured: 162, difference: -18 });
    expect(await onHand(db, pla)).toBe(162);
    expect(await currentAverage(db, pla)).toBeCloseTo(0.0175, 6);
    const [f] = await db.select().from(stockItems).where(eq(stockItems.id, pla));
    expect(f!.emptySpoolWeightG).toBe(250);
    expect(await db.select().from(adjustments)).toHaveLength(1);
    const [h] = await historyFeed(db, { area: "stock" });
    expect(h).toMatchObject({
      item: "PLA Black",
      before: 180,
      after: 162,
      reason: "Weighed · Monthly check",
      who: "joe",
      restorable: false,
    });
  });

  it("new count and add or remove; found pieces go to an open order", async () => {
    const o = await createOrder(db, {
      channel: "whatsapp",
      customerId: null,
      newCustomerName: null,
      dueOn: null,
      currency: "USD",
      rateToUsd: 1,
      deliveryCharge: null,
      deliveredBy: null,
      notes: null,
    });
    const line = await addLine(db, o, { productId: clip, quantity: 3, unitPrice: null, customization: null });
    await adjustStock(db, { stockItemId: clipStock, mode: "count", count: 3, reason: "Found", note: null });
    expect(await onHand(db, clipStock)).toBe(3);
    const [l] = await db.select().from(orderItems).where(eq(orderItems.id, line));
    expect(l!.qtyReserved).toBe(3);
    await adjustStock(db, {
      stockItemId: clipStock,
      mode: "delta",
      delta: -1,
      reason: "Damaged or broken",
      note: null,
    });
    expect(await onHand(db, clipStock)).toBe(2);
    expect(await db.select().from(editLog).where(eq(editLog.field, "on_hand"))).toHaveLength(2);
  });

  it("refuses weighing a non-filament, half pieces and no change", async () => {
    const e = (p: Promise<unknown>) =>
      p.then(
        () => "ok",
        (x: Error) => (x instanceof AdjustError ? x.message : "other"),
      );
    expect(
      await e(
        adjustStock(db, {
          stockItemId: clipStock,
          mode: "weigh",
          scaleG: 5,
          emptySpoolG: 0,
          reason: "Weighed",
          note: null,
        }),
      ),
    ).toMatch(/filament/);
    expect(
      await e(adjustStock(db, { stockItemId: clipStock, mode: "count", count: 1.5, reason: "Counted", note: null })),
    ).toMatch(/whole/);
    expect(
      await e(adjustStock(db, { stockItemId: pla, mode: "count", count: 180, reason: "Counted", note: null })),
    ).toMatch(/already/);
  });
});
