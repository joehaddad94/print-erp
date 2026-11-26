import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { machines, products, stockItems } from "@/db/schema";
import { seed } from "@/db/seed";
import { costWalkthrough } from "@/server/costs/walkthrough";
import { expenseSchema } from "@/server/expenses/schema";
import { createExpense } from "@/server/expenses/service";
import { addLine, createOrder, deliver, setStatus } from "@/server/orders/service";
import { finishJob, getJob, startJob } from "@/server/printing/service";
import { importSchema } from "@/server/recipes/schema";
import { importRecipe } from "@/server/recipes/service";
import { setSetting } from "@/server/settings/service";
import { putLocal } from "@/server/storage";
import { syntheticGcode } from "../support/synthetic-gcode";
import { setupTestDb } from "./helpers";

const { db } = setupTestDb();
const close = (a: number | null | undefined, b: number) => expect(a!).toBeCloseTo(b, 5);

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "print-erp-r9-"));
  process.env.LOCAL_UPLOAD_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("R9 How costs work", () => {
  it("has nothing to walk through before a print is finished", async () => {
    const w = await costWalkthrough(db);
    expect(w.job).toBeNull();
    expect(w.sale).toBeNull();
  });

  it("walks the padel numbers through all seven steps, matching what the app saved", async () => {
    await seed(db);
    await setSetting(db, "electricity_kwh_price", 0.64);
    const [m] = await db.select().from(machines);
    await db
      .update(machines)
      .set({ purchaseAmount: 200, expectedLifeHours: 3000, avgPowerKw: 0.12 })
      .where(eq(machines.id, m!.id));
    const buy = (amount: string, more: Record<string, string>) =>
      createExpense(
        db,
        expenseSchema.parse({
          spentOn: "2026-11-01",
          category: "filament",
          amount,
          currency: "USD",
          grams: "1000",
          ...more,
        }),
      );
    await buy("17.50", { newMaterial: "PLA", newColor: "Black" });
    const [pla] = await db.select().from(stockItems).where(eq(stockItems.type, "filament"));
    await buy("20", { filamentId: String(pla!.id) });
    const text = syntheticGcode({ objects: [{ name: "padel.stl", ids: ["1"] }], totalGrams: 29.22, timeSeconds: 6450 });
    const fileUrl = await putLocal("padel.gcode", new TextEncoder().encode(text));
    const r = await importRecipe(
      db,
      importSchema.parse({
        fileUrl,
        fileName: "padel.gcode",
        name: "Padel holder",
        recipeGroup: null,
        changeNote: null,
        items: [
          { productId: null, newProductName: "Padel holder", objectName: "padel.stl", qty: 1, gramsPerPiece: 29.22 },
        ],
      }),
    );
    const id = await startJob(db, {
      recipeId: r.id,
      machineId: m!.id,
      filamentId: pla!.id,
      secondFilamentId: null,
      firstFilamentGrams: null,
    });
    const job = (await getJob(db, id))!;
    await finishJob(db, id, {
      hours: 2,
      hoursSource: "gcode_estimate",
      stoppedAtPct: 100,
      powerCut: false,
      failureReason: null,
      good: { [job.items[0]!.line.id]: 1 },
      weighed: {},
    });
    const [product] = await db.select().from(products).where(eq(products.name, "Padel holder"));
    await db.update(products).set({ salePriceUsd: 6 }).where(eq(products.id, product!.id));
    const orderId = await createOrder(db, {
      channel: "whatsapp",
      customerId: null,
      newCustomerName: "Rami",
      dueOn: null,
      currency: "USD",
      rateToUsd: 1,
      deliveryCharge: null,
      deliveredBy: null,
      notes: null,
    });
    await addLine(db, orderId, { productId: product!.id, quantity: 1, unitPrice: null, customization: null });
    await setStatus(db, orderId, "confirmed");
    await deliver(db, orderId, { deliveredBy: null, deliveryCharge: null });

    const w = await costWalkthrough(db);
    const j = w.job!;
    const saved = (await getJob(db, id))!;
    // 1. Second purchase averaged in: 1000 g at 0.0175 + 1000 g for $20 → 0.01875/g.
    expect(j.filaments[0]!.purchase).toMatchObject({ hadGrams: 1000, boughtGrams: 1000 });
    close(j.filaments[0]!.purchase!.hadAvg, 0.0175);
    close(j.filaments[0]!.purchase!.avgAfter, 0.01875);
    close(j.filaments[0]!.perGram, 0.01875);
    // 2. $200 ÷ 3,000 h.
    close(j.perHour, 200 / 3000);
    expect(j.machine).toMatchObject({ priceUsd: 200, lifeHours: 3000 });
    // 3. The parts add up to what the print saved.
    close(j.filamentUsd, 29.22 * 0.01875);
    close(j.electricityUsd, 0.12 * 2 * 0.64);
    close(j.wearUsd, (2 * 200) / 3000);
    close(j.filamentUsd + j.electricityUsd + j.wearUsd, saved.jobCostUsd!);
    // 4–5. One item gets it all; allowance divides by 1 × (1 − 12%).
    close(j.first.share, saved.jobCostUsd!);
    expect(j.method).toBe("allowance");
    close(j.first.share / (1 - j.allowancePct / 100), saved.items[0]!.line.unitCostUsd!);
    // 6. Stock was empty, so the average is the print's unit cost.
    expect(j.stock).toMatchObject({ had: 0, added: 1 });
    close(j.stock!.avgAfter, saved.items[0]!.line.unitCostUsd!);
    // 7. Profit = $6 − unit cost (no box).
    expect(w.sale).toMatchObject({ orderId, qty: 1, packaging: 0 });
    close(w.sale!.profit, 6 - saved.items[0]!.line.unitCostUsd!);
  });
});
