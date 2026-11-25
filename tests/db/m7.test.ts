import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { machines, printJobItems, products, stockItems } from "@/db/schema";
import { seed } from "@/db/seed";
import { backupFiles, createBackup, restoreBackup, tableNames, tableStats, toCsv } from "@/server/backup";
import { expenseSchema } from "@/server/expenses/schema";
import { createExpense } from "@/server/expenses/service";
import { finishJob, getJob, startJob } from "@/server/printing/service";
import { productSchema } from "@/server/products/schema";
import { updateProduct } from "@/server/products/service";
import { importSchema } from "@/server/recipes/schema";
import { importRecipe } from "@/server/recipes/service";
import { setSetting } from "@/server/settings/service";
import { putLocal } from "@/server/storage";
import { connect, freshDatabase } from "../support/pg";
import { syntheticGcode } from "../support/synthetic-gcode";
import { setupTestDb } from "./helpers";

const { db } = setupTestDb();

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "print-erp-m7-"));
  process.env.LOCAL_UPLOAD_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A small but realistic dataset: purchase, recipe, a finished print (generated column), an edit, text with commas and quotes. */
beforeEach(async () => {
  await seed(db);
  await setSetting(db, "electricity_kwh_price", 0.64);
  const [m] = await db.select().from(machines);
  await db
    .update(machines)
    .set({ purchaseAmount: 200, expectedLifeHours: 3000, avgPowerKw: 0.12 })
    .where(eq(machines.id, m!.id));
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
      notes: 'Bought "2 for 1", with tax\nsecond line',
    }),
  );
  const fileUrl = await putLocal(
    "holder.gcode",
    new TextEncoder().encode(
      syntheticGcode({ objects: [{ name: "holder.stl", ids: ["1", "2"] }], totalGrams: 20, timeSeconds: 3600 }),
    ),
  );
  const r = await importRecipe(
    db,
    importSchema.parse({
      fileUrl,
      fileName: "holder.gcode",
      name: "Holder",
      recipeGroup: null,
      changeNote: null,
      items: [{ productId: null, newProductName: "Holder", objectName: "holder.stl", qty: 2, gramsPerPiece: 10 }],
    }),
  );
  const [fil] = await db.select().from(stockItems).where(eq(stockItems.type, "filament"));
  const id = await startJob(db, {
    recipeId: r.id,
    machineId: m!.id,
    filamentId: fil!.id,
    secondFilamentId: null,
    firstFilamentGrams: null,
  });
  const job = await getJob(db, id);
  await finishJob(db, id, {
    hours: 1,
    hoursSource: "gcode_estimate",
    stoppedAtPct: 100,
    powerCut: false,
    failureReason: null,
    good: { [job!.items[0]!.line.id]: 1 },
    weighed: {},
  });
  const [p] = await db.select().from(products).where(eq(products.name, "Holder"));
  await updateProduct(
    db,
    p!.id,
    productSchema.parse({ name: "Holder", kind: "product", salePriceUsd: "5" }),
    undefined,
  );
});

describe("K-B1 backup contents", () => {
  it("one CSV per table with the right row counts, a JSON dump, and the G-code manifest", async () => {
    const b = await createBackup(db);
    const names = await tableNames(db);
    expect(Object.keys(b.tables).sort()).toEqual(names);
    for (const n of names) {
      const s = await tableStats(db, n);
      expect(b.tables[n]!.count, n).toBe(s.count);
      expect(b.tables[n]!.rows, n).toHaveLength(s.count);
    }
    expect(b.tables.print_job_items!.count).toBe(1);
    expect(b.tables.edit_log!.count).toBeGreaterThan(0);
    expect(b.files).toEqual([expect.objectContaining({ name: "Holder", fileName: "holder.gcode" })]);
    expect(b.files[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);

    const files = backupFiles(b);
    expect(files.filter((f) => f.name.endsWith(".csv"))).toHaveLength(names.length);
    expect(files.map((f) => f.name)).toEqual(expect.arrayContaining(["backup.json", "manifest.json"]));
    // CSV: header + one line per row; a value with quotes, a comma and a newline stays one cell.
    const expenses = toCsv(b.tables.expenses!);
    expect(expenses).toContain('"Bought ""2 for 1"", with tax\nsecond line"');
    const items = files.find((f) => f.name === "print_job_items.csv")!.body;
    expect(items.trim().split("\r\n")).toHaveLength(2);
    expect(items.split("\r\n")[0]).toContain("qty_failed");
  });
});

describe("K-B2 restore drill", () => {
  it("restores into an empty, migrated database with every row count and checksum matching", async () => {
    const b = JSON.parse(JSON.stringify(await createBackup(db))) as Awaited<ReturnType<typeof createBackup>>;
    const target = connect(await freshDatabase("print_erp_restore_drill"));
    try {
      await restoreBackup(target.db, b);
      for (const [name, want] of Object.entries(b.tables)) {
        const got = await tableStats(target.db, name);
        expect(got, name).toEqual({ count: want.count, checksum: want.checksum });
      }
      // Generated column recomputed, and new rows get fresh ids after the restored ones.
      const [item] = await target.db.select().from(printJobItems);
      expect(item!.qtyFailed).toBe(1);
      const [p] = await target.db.insert(products).values({ name: "After restore" }).returning();
      expect(p!.id).toBeGreaterThan(Math.max(...b.tables.products!.rows.map((r) => Number(r.id))));
    } finally {
      await target.client.end();
    }
  });

  it("refuses a database that is missing a table", async () => {
    const b = await createBackup(db);
    b.tables.not_a_table = { count: 0, checksum: "", columns: [], rows: [] };
    await expect(restoreBackup(db, b)).rejects.toThrow(/no table not_a_table/);
  });
});

describe("backup files on disk", () => {
  it("local storage receives every file", async () => {
    const before = readdirSync(dir).length;
    const b = await createBackup(db);
    const { putFile } = await import("@/server/storage");
    for (const f of backupFiles(b))
      await putFile(`backups/x/${f.name}`, new TextEncoder().encode(f.body), f.contentType);
    const after = readdirSync(dir);
    expect(after.length - before).toBe(backupFiles(b).length);
    const json = after.find((n) => n.endsWith("backup.json"))!;
    expect(JSON.parse(readFileSync(path.join(dir, json), "utf8")).format).toBe(1);
  });
});
