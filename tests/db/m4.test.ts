import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adjustments, editLog, machines, printJobs, settings, stockItems, stockMovements } from "@/db/schema";
import { seed } from "@/db/seed";
import { expenseSchema } from "@/server/expenses/schema";
import { createExpense } from "@/server/expenses/service";
import {
  editFinishedJob,
  finishJob,
  getJob,
  PrintError,
  startJob,
  weighFilament,
  type FinishFormInput,
} from "@/server/printing/service";
import { importSchema } from "@/server/recipes/schema";
import { importRecipe } from "@/server/recipes/service";
import { setSetting } from "@/server/settings/service";
import { currentAverage, onHand } from "@/server/stock/ledger";
import { putLocal } from "@/server/storage";
import { syntheticGcode } from "../support/synthetic-gcode";
import { setupTestDb } from "./helpers";

const { db } = setupTestDb();
const close = (a: number | null | undefined, b: number) => expect(a!).toBeCloseTo(b, 5);

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "print-erp-m4-"));
  process.env.LOCAL_UPLOAD_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Plan §M1 assumptions: PLA $17.50/kg, $0.64/kWh, 0.12 kW, machine $200 ÷ 3,000 h. */
let printer: number;
let pla: number;
beforeEach(async () => {
  await seed(db);
  await setSetting(db, "electricity_kwh_price", 0.64);
  const [m] = await db.select().from(machines);
  await db
    .update(machines)
    .set({ purchaseAmount: 200, expectedLifeHours: 3000, avgPowerKw: 0.12 })
    .where(eq(machines.id, m!.id));
  printer = m!.id;
  await createExpense(
    db,
    expenseSchema.parse({
      spentOn: "2026-11-01",
      category: "filament",
      amount: "17.50",
      currency: "USD",
      newMaterial: "PLA",
      newColor: "Black",
      grams: "1000",
    }),
  );
  [{ id: pla }] = (await db.select({ id: stockItems.id }).from(stockItems).where(eq(stockItems.type, "filament"))) as [
    { id: number },
  ];
});

let fileN = 0;
async function recipe(name: string, grams: number, ids: string[], seconds = 3600) {
  const text = syntheticGcode({
    objects: [{ name: `${name}.stl`, ids }],
    totalGrams: grams,
    timeSeconds: seconds + fileN++,
  });
  const fileUrl = await putLocal(`${name}.gcode`, new TextEncoder().encode(text));
  return importRecipe(
    db,
    importSchema.parse({
      fileUrl,
      fileName: `${name}.gcode`,
      name,
      recipeGroup: null,
      changeNote: null,
      items: [
        {
          productId: null,
          newProductName: name,
          objectName: `${name}.stl`,
          qty: ids.length,
          gramsPerPiece: grams / ids.length,
        },
      ],
    }),
  );
}

const finishInput = (job: Awaited<ReturnType<typeof getJob>>, o: Partial<FinishFormInput> = {}): FinishFormInput => ({
  hours: 1,
  hoursSource: "gcode_estimate",
  stoppedAtPct: 100,
  powerCut: false,
  failureReason: null,
  good: Object.fromEntries(job!.items.map((i) => [i.line.id, i.line.qtyPlanned])),
  weighed: {},
  ...o,
});

async function productStock(name: string) {
  const [s] = await db
    .select()
    .from(stockItems)
    .where(and(eq(stockItems.name, name), isNull(stockItems.deletedAt)));
  return s!;
}

describe("J-01 golden path (padel numbers)", () => {
  it("Start → Finish 1 good: job 0.76841, unit 0.87319, stock +1, filament −29.22 g", async () => {
    const r = await recipe("Padel holder", 29.22, ["1"], 6450);
    const id = await startJob(db, {
      recipeId: r.id,
      machineId: printer,
      filamentId: pla,
      secondFilamentId: null,
      firstFilamentGrams: null,
    });
    const res = await finishJob(db, id, finishInput(await getJob(db, id), { hours: 6450.35 / 3600 }));
    expect(res.complete).toBe(true);
    const job = (await getJob(db, id))!;
    close(job.jobCostUsd, 0.76841);
    expect(job.hoursSource).toBe("gcode_estimate");
    close(job.items[0]!.line.unitCostUsd, 0.87319);
    const stock = await productStock("Padel holder");
    expect(await onHand(db, stock.id)).toBe(1);
    close(await currentAverage(db, stock.id), 0.87319);
    close(await onHand(db, pla), 1000 - 29.22);
    expect(job.filaments[0]!.line.gramsSource).toBe("recipe_estimate");
  });
});

describe("J-03 busy printer (D34)", () => {
  it("refuses a second Start, and the database refuses a direct second insert (F-03)", async () => {
    const r = await recipe("Clip", 10, ["1", "2"]);
    await startJob(db, {
      recipeId: r.id,
      machineId: printer,
      filamentId: pla,
      secondFilamentId: null,
      firstFilamentGrams: null,
    });
    await expect(
      startJob(db, {
        recipeId: r.id,
        machineId: printer,
        filamentId: pla,
        secondFilamentId: null,
        firstFilamentGrams: null,
      }),
    ).rejects.toThrow(/is busy/);
    await expect(db.insert(printJobs).values({ recipeId: r.id, machineId: printer })).rejects.toThrow();
  });
});

describe("J-04/J-05/J-06 croix partial success", () => {
  it("J-04 actual method after 20 prints: 3 of 4 good → +3 at 0.10380, waste 0.07785", async () => {
    const r = await recipe("Croix", 8.47, ["1", "2", "3", "4"], 4094);
    for (let k = 0; k < 20; k++) {
      const id = await startJob(db, {
        recipeId: r.id,
        machineId: printer,
        filamentId: pla,
        secondFilamentId: null,
        firstFilamentGrams: null,
      });
      await finishJob(db, id, finishInput(await getJob(db, id), { hours: 0.1 }));
    }
    const before = await onHand(db, (await productStock("Croix")).id);
    const id = await startJob(db, {
      recipeId: r.id,
      machineId: printer,
      filamentId: pla,
      secondFilamentId: null,
      firstFilamentGrams: null,
    });
    const job = (await getJob(db, id))!;
    expect(job.failureMethod).toBe("actual");
    await finishJob(db, id, finishInput(job, { hours: 4094.37 / 3600, good: { [job.items[0]!.line.id]: 3 } }));
    const done = (await getJob(db, id))!;
    close(done.jobCostUsd, 0.31139);
    close(done.items[0]!.line.unitCostUsd, 0.1038);
    close(done.wasteCostUsd, 0.07785);
    expect(done.items[0]!.line.qtyFailed).toBe(1);
    expect((await onHand(db, (await productStock("Croix")).id)) - before).toBe(3);
  });
  it("J-05 stopped at 60%, not weighed → 5.082 g, estimated", async () => {
    const r = await recipe("Croix", 8.47, ["1", "2", "3", "4"]);
    const id = await startJob(db, {
      recipeId: r.id,
      machineId: printer,
      filamentId: pla,
      secondFilamentId: null,
      firstFilamentGrams: null,
    });
    const res = await finishJob(db, id, finishInput(await getJob(db, id), { stoppedAtPct: 60, good: {} }));
    expect(res.complete && res.estimated).toBe(true);
    close((await getJob(db, id))!.filaments[0]!.line.gramsUsed, 5.082);
  });
  it("J-06 weighed grams win, source weighed, not estimated", async () => {
    const r = await recipe("Croix", 8.47, ["1", "2", "3", "4"]);
    const id = await startJob(db, {
      recipeId: r.id,
      machineId: printer,
      filamentId: pla,
      secondFilamentId: null,
      firstFilamentGrams: null,
    });
    const job = await getJob(db, id);
    const res = await finishJob(db, id, finishInput(job, { weighed: { [job!.filaments[0]!.line.id]: 9.1 } }));
    expect(res.complete && res.estimated).toBe(false);
    const f = (await getJob(db, id))!.filaments[0]!.line;
    expect([f.gramsUsed, f.gramsSource, f.weighedGrams]).toEqual([9.1, "weighed", 9.1]);
  });
});

describe("J-07 snapshots", () => {
  it("changing the electricity price after Start doesn't change that job's cost", async () => {
    const r = await recipe("Padel holder", 29.22, ["1"]);
    const id = await startJob(db, {
      recipeId: r.id,
      machineId: printer,
      filamentId: pla,
      secondFilamentId: null,
      firstFilamentGrams: null,
    });
    await setSetting(db, "electricity_kwh_price", 5);
    await finishJob(db, id, finishInput(await getJob(db, id), { hours: 6450.35 / 3600 }));
    close((await getJob(db, id))!.jobCostUsd, 0.76841);
  });
  it("an input missing at Start is filled at Finish; still missing → refused with the list", async () => {
    await db.insert(settings).values({ key: "electricity_kwh_price", value: sql`'null'::jsonb` });
    const r = await recipe("Clip", 10, ["1", "2"]);
    const id = await startJob(db, {
      recipeId: r.id,
      machineId: printer,
      filamentId: pla,
      secondFilamentId: null,
      firstFilamentGrams: null,
    });
    const err = await finishJob(db, id, finishInput(await getJob(db, id))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PrintError);
    expect((err as PrintError).missing).toEqual(["electricity_price"]);
    expect((await getJob(db, id))!.finishedAt).toBeNull();
    await setSetting(db, "electricity_kwh_price", 0.64);
    await expect(finishJob(db, id, finishInput(await getJob(db, id)))).resolves.toMatchObject({ complete: true });
  });
});

describe("J-08 editing a finished job (D13)", () => {
  it("good count edit updates the stock movement and logs both", async () => {
    const r = await recipe("Croix", 8.47, ["1", "2", "3", "4"]);
    const id = await startJob(db, {
      recipeId: r.id,
      machineId: printer,
      filamentId: pla,
      secondFilamentId: null,
      firstFilamentGrams: null,
    });
    await finishJob(db, id, finishInput(await getJob(db, id)));
    const job = (await getJob(db, id))!;
    const stock = await productStock("Croix");
    expect(await onHand(db, stock.id)).toBe(4);
    await editFinishedJob(db, id, finishInput(job, { good: { [job.items[0]!.line.id]: 2 } }));
    expect(await onHand(db, stock.id)).toBe(2);
    const log = await db.select().from(editLog);
    expect(log.map((l) => `${l.tableName}.${l.field}`)).toEqual(
      expect.arrayContaining(["print_job_items.qty_good", "stock_movements.amount"]),
    );
    close(await onHand(db, pla), 1000 - 8.47);
  });
  it("two filaments: grams split as entered at Start", async () => {
    const r = await recipe("Clip", 10, ["1", "2"]);
    await createExpense(
      db,
      expenseSchema.parse({
        spentOn: "2026-11-01",
        category: "filament",
        amount: "20",
        currency: "USD",
        newMaterial: "PLA",
        newColor: "White",
        grams: "1000",
      }),
    );
    const [white] = await db.select().from(stockItems).where(eq(stockItems.name, "PLA White"));
    const id = await startJob(db, {
      recipeId: r.id,
      machineId: printer,
      filamentId: pla,
      secondFilamentId: white!.id,
      firstFilamentGrams: 7,
    });
    await finishJob(db, id, finishInput(await getJob(db, id), { stoppedAtPct: 50, good: {} }));
    const lines = (await getJob(db, id))!.filaments.map((f) => f.line.gramsUsed);
    expect(lines).toEqual([3.5, 1.5]);
    const job = (await getJob(db, id))!;
    await editFinishedJob(db, id, finishInput(job, { stoppedAtPct: 100 }));
    expect((await getJob(db, id))!.filaments.map((f) => f.line.gramsUsed)).toEqual([7, 3]);
  });
});

describe("J-09 weigh filament", () => {
  it("612 g and 402 g, empty 140 g each → measured 734 g; difference stored once", async () => {
    const adj = await weighFilament(db, { filamentId: pla, readings: [612, 402], emptySpoolG: 140, reason: null });
    expect([adj.measured, adj.expected, adj.difference]).toEqual([734, 1000, -266]);
    expect(await onHand(db, pla)).toBe(734);
    const moves = await db.select().from(stockMovements).where(eq(stockMovements.adjustmentId, adj.id));
    expect(moves).toHaveLength(1);
    expect(await db.select().from(adjustments)).toHaveLength(1);
    const [f] = await db.select().from(stockItems).where(eq(stockItems.id, pla));
    expect(f!.emptySpoolWeightG).toBe(140);
  });
});
