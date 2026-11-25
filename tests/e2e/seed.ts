import { eq } from "drizzle-orm";
import { machines, stockItems } from "@/db/schema";
import { expenseSchema } from "@/server/expenses/schema";
import { createExpense } from "@/server/expenses/service";
import { importSchema } from "@/server/recipes/schema";
import { importRecipe } from "@/server/recipes/service";
import { setSetting } from "@/server/settings/service";
import { putLocal } from "@/server/storage";
import { E2E_UPLOAD_DIR } from "../../playwright.config";
import { syntheticGcode } from "../support/synthetic-gcode";
import { withDb } from "./db";

process.env.LOCAL_UPLOAD_DIR = E2E_UPLOAD_DIR;
delete process.env.BLOB_READ_WRITE_TOKEN;

export type Setup = {
  recipe: string;
  printer: string;
  filament: string;
  printerId: number;
  recipeId: number;
  filamentId: number;
};

/** A padel-shaped recipe (29.22 g, 1 piece, 6,450 s), its own printer and filament, per test. */
export async function setup(tag: string, printer: Partial<typeof machines.$inferInsert> = {}): Promise<Setup> {
  return withDb(async (db) => {
    await setSetting(db, "electricity_kwh_price", 0.64);
    const name = `Holder ${tag}`;
    const text = syntheticGcode({
      objects: [{ name: `holder-${tag}.stl`, ids: ["1"] }],
      totalGrams: 29.22,
      timeSeconds: 6450,
    });
    const fileUrl = await putLocal(`${tag}.gcode`, new TextEncoder().encode(`${text}; tag ${tag} ${Date.now()}\n`));
    const r = await importRecipe(
      db,
      importSchema.parse({
        fileUrl,
        fileName: `${tag}.gcode`,
        name,
        recipeGroup: null,
        changeNote: null,
        items: [{ productId: null, newProductName: name, objectName: null, qty: 1, gramsPerPiece: 29.22 }],
      }),
    );
    const [m] = await db
      .insert(machines)
      .values({
        name: `Printer ${tag}`,
        type: "printer",
        model: "Ender-3 V3 SE",
        nozzleMm: 0.4,
        avgPowerKw: 0.12,
        purchaseAmount: 200,
        expectedLifeHours: 3000,
        ...printer,
      })
      .returning();
    await createExpense(
      db,
      expenseSchema.parse({
        spentOn: "2026-11-25",
        category: "filament",
        amount: "17.50",
        currency: "USD",
        newMaterial: "PLA",
        newColor: tag,
        grams: "1000",
      }),
    );
    return {
      recipe: `${name} · v1`,
      printer: m!.name,
      filament: `PLA ${tag}`,
      printerId: m!.id,
      recipeId: r.id,
      filamentId: (
        await db
          .select()
          .from(stockItems)
          .where(eq(stockItems.name, `PLA ${tag}`))
      )[0]!.id,
    };
  });
}
