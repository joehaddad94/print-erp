import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { editLog, expenses, machines, printJobs, recipes, stockItems, stockMovements } from "@/db/schema";
import { seed } from "@/db/seed";
import { historyFor, lastEdited, softDeleteLogged, updateLogged } from "@/server/edits/engine";
import { expenseSchema } from "@/server/expenses/schema";
import { createExpense, deleteExpense, getExpense, listExpenses, updateExpense } from "@/server/expenses/service";
import { getMachine } from "@/server/machines/service";
import { currentSettings, numberSetting, setSetting, settingHistory } from "@/server/settings/service";
import { findOrCreateSupplier, listSuppliers } from "@/server/suppliers/service";
import { currentAverage, onHand } from "@/server/stock/ledger";
import { setupTestDb } from "./helpers";

const { db } = setupTestDb();

const form = (v: Record<string, string>) => {
  const parsed = expenseSchema.safeParse({ spentOn: "2026-11-24", currency: "USD", ...v });
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
  return parsed.data;
};

describe("S-01 dated settings", () => {
  it("adds a row per change, never overwrites, and 'current' is the latest valid_from ≤ now", async () => {
    const t1 = new Date("2026-11-01T00:00:00Z");
    const t2 = new Date("2026-11-20T00:00:00Z");
    expect(await setSetting(db, "electricity_kwh_price", 0.6, t1)).toBe(true);
    expect(await setSetting(db, "electricity_kwh_price", 0.6, t2)).toBe(false); // unchanged: no row
    expect(await setSetting(db, "electricity_kwh_price", 0.64, t2)).toBe(true);
    expect(await numberSetting(db, "electricity_kwh_price", new Date("2026-11-10"))).toBe(0.6);
    expect(await numberSetting(db, "electricity_kwh_price")).toBe(0.64);
    expect((await settingHistory(db, "electricity_kwh_price")).map((r) => r.value)).toEqual([0.64, 0.6]);
  });
  it("seed defaults are visible as current settings", async () => {
    await seed(db);
    expect(await currentSettings(db)).toMatchObject({ failure_allowance_pct: 12, failure_actual_after_prints: 20 });
  });
});

describe("S-03 filament purchase (D9, D23)", () => {
  it("writes the expense, a new filament and a +movement at price per gram, with the average", async () => {
    const id = await createExpense(
      db,
      form({
        category: "filament",
        amount: "17",
        newMaterial: "PLA",
        newColor: "Black",
        grams: "1000",
        emptySpoolWeightG: "140",
      }),
    );
    const [f] = await db.select().from(stockItems);
    expect(f).toMatchObject({ name: "PLA Black", type: "filament", unit: "grams", emptySpoolWeightG: 140 });
    expect(await onHand(db, f!.id)).toBe(1000);
    expect(await currentAverage(db, f!.id)).toBeCloseTo(0.017, 12);
    await createExpense(db, form({ category: "filament", amount: "18", filamentId: String(f!.id), grams: "1000" }));
    expect(await currentAverage(db, f!.id)).toBeCloseTo(0.0175, 12); // C-12
    const [e] = await db.select().from(expenses).where(eq(expenses.id, id));
    expect(e!.stockItemId).toBe(f!.id);
  });

  it("is one transaction: a failure halfway leaves no rows", async () => {
    // filament id 9999 doesn't exist: fails after the expense row was written
    await expect(
      createExpense(db, form({ category: "filament", amount: "17", filamentId: "9999", grams: "1000" })),
    ).rejects.toThrow();
    expect(await db.select().from(expenses)).toHaveLength(0);
    expect(await db.select().from(stockItems)).toHaveLength(0);
  });

  it("C-15/S-04 LBP purchase converts at the entered rate", async () => {
    await createExpense(
      db,
      form({
        category: "filament",
        amount: "1790000",
        currency: "LBP",
        lbpRate: "89500",
        newMaterial: "PETG",
        newColor: "Red",
        grams: "1000",
      }),
    );
    const [e] = await db.select().from(expenses);
    expect(e!.rateToUsd).toBeCloseTo(1 / 89500, 14);
    const [f] = await db.select().from(stockItems);
    expect(await currentAverage(db, f!.id)).toBeCloseTo(0.02, 10);
  });

  it("packaging purchase adds pieces at unit cost; machine purchase creates the machine", async () => {
    await createExpense(db, form({ category: "packaging", amount: "15", newPackagingName: "Small box", pieces: "50" }));
    const [box] = await db.select().from(stockItems);
    expect(box).toMatchObject({ type: "consumable", unit: "pieces" });
    expect(await currentAverage(db, box!.id)).toBeCloseTo(0.3, 10);
    await createExpense(
      db,
      form({ category: "machine", amount: "180", machineName: "Ender-3 V3 SE #2", machineType: "printer" }),
    );
    const [m] = await db.select().from(machines);
    expect(m).toMatchObject({
      name: "Ender-3 V3 SE #2",
      type: "printer",
      purchaseAmount: 180,
      expectedLifeHours: 3000,
    });
    expect((await getMachine(db, m!.id))!.costPerHourUsd).toBeCloseTo(0.06, 10);
  });

  it("validation: filament needs grams and a filament; LBP needs a rate", () => {
    const r = expenseSchema.safeParse({ spentOn: "2026-11-24", category: "filament", amount: "5", currency: "LBP" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["grams", "filamentId", "lbpRate"]));
  });
});

describe("E-01..E-03 edit engine (D13)", () => {
  it("E-01 two changed fields → exactly two edit_log rows; unchanged fields write none", async () => {
    const [m] = await db.insert(machines).values({ name: "P1", type: "printer", avgPowerKw: 0.12 }).returning();
    await db.transaction((tx) =>
      updateLogged(tx, machines, m!.id, { name: "P1", avgPowerKw: 0.13, expectedLifeHours: 4000 }),
    );
    const logs = await historyFor(db, "machines", m!.id);
    expect(logs.map((l) => [l.field, l.oldValue, l.newValue]).sort()).toEqual([
      ["avg_power_kw", 0.12, 0.13],
      ["expected_life_hours", null, 4000],
    ]);
    const again = await db.transaction((tx) => updateLogged(tx, machines, m!.id, { avgPowerKw: 0.13 }));
    expect(again.changed).toEqual([]);
    expect((await lastEdited(db, "machines", [m!.id])).has(m!.id)).toBe(true);
  });

  it("E-02 delete is soft, logged with all values, and leaves lists", async () => {
    const id = await createExpense(db, form({ category: "other", amount: "4", notes: "tape" }));
    await deleteExpense(db, id);
    const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
    expect(row!.deletedAt).not.toBeNull();
    const [log] = await db.select().from(editLog).where(eq(editLog.rowId, id));
    expect(log).toMatchObject({ action: "delete", field: "*" });
    expect((log!.oldValue as Record<string, unknown>).notes).toBe("tape");
    expect(await listExpenses(db)).toHaveLength(0);
  });

  it("E-03 editing a purchase's grams updates the movement, logs it and replays averages", async () => {
    const id = await createExpense(
      db,
      form({ category: "filament", amount: "17", newMaterial: "PLA", newColor: "Black", grams: "1000" }),
    );
    const [f] = await db.select().from(stockItems);
    await createExpense(
      db,
      form({ category: "filament", amount: "18", filamentId: String(f!.id), grams: "1000", spentOn: "2026-11-25" }),
    );
    await updateExpense(db, id, form({ category: "filament", amount: "17", filamentId: String(f!.id), grams: "500" }));
    expect(await onHand(db, f!.id)).toBe(1500);
    // 500 g at 0.034 then 1000 g at 0.018 → (17 + 18) / 1500
    expect(await currentAverage(db, f!.id)).toBeCloseTo(35 / 1500, 7); // usd columns keep 8 decimals
    const [mv] = await db.select().from(stockMovements).where(eq(stockMovements.expenseId, id));
    expect((await historyFor(db, "stock_movements", mv!.id)).map((l) => l.field)).toEqual(
      expect.arrayContaining(["amount", "unit_cost_usd"]),
    );
    expect((await getExpense(db, id))!.purchaseQty).toBe(500);
    const list = await listExpenses(db);
    expect(list.find((e) => e.id === id)!.editedAt).toBeNull(); // the expense row itself didn't change
  });

  it("deleting a purchase removes its grams and replays the average", async () => {
    const a = await createExpense(
      db,
      form({ category: "filament", amount: "17", newMaterial: "PLA", newColor: "Black", grams: "1000" }),
    );
    const [f] = await db.select().from(stockItems);
    await createExpense(
      db,
      form({ category: "filament", amount: "18", filamentId: String(f!.id), grams: "1000", spentOn: "2026-11-25" }),
    );
    await deleteExpense(db, a);
    expect(await onHand(db, f!.id)).toBe(1000);
    expect(await currentAverage(db, f!.id)).toBeCloseTo(0.018, 10);
  });

  it("soft delete is idempotent", async () => {
    const [m] = await db.insert(machines).values({ name: "X", type: "equipment" }).returning();
    await db.transaction((tx) => softDeleteLogged(tx, machines, m!.id));
    await db.transaction((tx) => softDeleteLogged(tx, machines, m!.id));
    expect(await historyFor(db, "machines", m!.id)).toHaveLength(1);
  });
});

describe("S-02 machines and suppliers", () => {
  it("hours used sums non-deleted jobs; supplier total spent in USD", async () => {
    const [m] = await db
      .insert(machines)
      .values({ name: "P", type: "printer", purchaseAmount: 200, expectedLifeHours: 3000 })
      .returning();
    const [r] = await db
      .insert(recipes)
      .values({
        name: "R",
        fileBlobUrl: "mem://r",
        fileName: "r.gcode",
        fileSizeBytes: 1,
        fileSha256: "b".repeat(64),
        parser: "creality_print_gcode",
        parserVersion: "1",
      })
      .returning();
    await db.insert(printJobs).values([
      { recipeId: r!.id, machineId: m!.id, finishedAt: new Date(), hours: 1.5, hoursSource: "entered" },
      {
        recipeId: r!.id,
        machineId: m!.id,
        finishedAt: new Date(),
        hours: 2,
        hoursSource: "entered",
        deletedAt: new Date(),
      },
    ]);
    const got = await getMachine(db, m!.id);
    expect(got).toMatchObject({ hoursUsed: 1.5 });
    expect(got!.costPerHourUsd).toBeCloseTo(200 / 3000, 12);

    const { suppliers } = await import("@/db/schema");
    const [s] = await db.insert(suppliers).values({ name: "Filament shop" }).returning();
    await createExpense(db, form({ category: "other", amount: "10", supplierId: String(s!.id) }));
    await createExpense(
      db,
      form({ category: "other", amount: "895000", currency: "LBP", lbpRate: "89500", supplierId: String(s!.id) }),
    );
    expect((await listSuppliers(db))[0]!.totalUsd).toBeCloseTo(20, 6);
  });

  it("S-03 quick add from the expense form; the same name again (any capitals/spaces) reuses it", async () => {
    const a = await findOrCreateSupplier(db, { name: "  Box   Co ", contact: "+961 3 000 000" });
    expect(a).toMatchObject({ name: "Box Co", existed: false });
    const b = await findOrCreateSupplier(db, { name: "box co", contact: null });
    expect(b).toEqual({ id: a.id, name: "Box Co", existed: true });
    expect(await listSuppliers(db)).toMatchObject([{ name: "Box Co", contact: "+961 3 000 000" }]);
  });
});
