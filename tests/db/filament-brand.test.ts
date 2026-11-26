import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { expenses, stockItems } from "@/db/schema";
import { expenseSchema } from "@/server/expenses/schema";
import { currentAverage, onHand } from "@/server/stock/ledger";
import { createExpense, deleteExpense, getExpense, listFilamentBrands, updateExpense } from "@/server/expenses/service";
import { setupTestDb } from "./helpers";

const { db } = setupTestDb();
const input = (o: Record<string, unknown>) => expenseSchema.parse({ spentOn: "2026-11-20", currency: "USD", ...o });
const brandOf = async (id: number) => (await getExpense(db, id))!.brand;

describe("Filament brand on purchases", () => {
  it("is optional, tidies spaces, and is capped at 60 characters", () => {
    const base = { category: "filament", amount: "20", newMaterial: "PLA", newColor: "Black", grams: "1000" };
    expect(input(base).brand).toBeNull();
    expect(input({ ...base, brand: "   " }).brand).toBeNull();
    expect(input({ ...base, brand: "  Elegoo   Rapid  " }).brand).toBe("Elegoo Rapid");
    expect(
      expenseSchema.safeParse({ spentOn: "2026-11-20", currency: "USD", ...base, brand: "x".repeat(61) }).success,
    ).toBe(false);
  });

  it("reuses an earlier spelling ignoring case, lists each brand once, newest first", async () => {
    const a = await createExpense(
      db,
      input({
        category: "filament",
        amount: "20",
        newMaterial: "PLA",
        newColor: "Brand",
        grams: "1000",
        brand: "eSun",
      }),
    );
    const [item] = await db.select().from(stockItems).where(eq(stockItems.color, "Brand"));
    const b = await createExpense(
      db,
      input({ category: "filament", amount: "18", filamentId: String(item!.id), grams: "1000", brand: "ESUN" }),
    );
    const c = await createExpense(
      db,
      input({
        category: "filament",
        amount: "15",
        filamentId: String(item!.id),
        grams: "1000",
        brand: "Sunlu",
        spentOn: "2026-11-25",
      }),
    );
    expect(await brandOf(a)).toBe("eSun");
    expect(await brandOf(b)).toBe("eSun");
    const brands = await listFilamentBrands(db);
    expect(brands.slice(0, 2)).toEqual(["Sunlu", "eSun"]);
    expect(brands.filter((x) => x.toLowerCase() === "esun")).toHaveLength(1);

    // D23: brand is not identity. Three purchases of different brands land on ONE filament row,
    // and its weighted average is plain (20 + 18 + 15) / 3000 g.
    const filaments = await db.select().from(stockItems).where(eq(stockItems.color, "Brand"));
    expect(filaments).toHaveLength(1);
    expect(await onHand(db, filaments[0]!.id)).toBe(3000);
    expect(await currentAverage(db, filaments[0]!.id)).toBeCloseTo(53 / 3000, 8);

    // Editing a brand (fixing its case) on the only row that has it keeps the new spelling.
    await updateExpense(
      db,
      c,
      input({
        category: "filament",
        amount: "15",
        filamentId: String(item!.id),
        grams: "1000",
        brand: "SUNLU",
        spentOn: "2026-11-25",
      }),
    );
    expect(await brandOf(c)).toBe("SUNLU");
    // Clearing it stores null.
    await updateExpense(
      db,
      c,
      input({ category: "filament", amount: "15", filamentId: String(item!.id), grams: "1000", spentOn: "2026-11-25" }),
    );
    expect(await brandOf(c)).toBeNull();
    await deleteExpense(db, c);
  });

  it("is never stored on non-filament purchases or running costs", async () => {
    const p = await createExpense(
      db,
      input({ category: "packaging", amount: "5", newPackagingName: "Box", pieces: "10", brand: "eSun" }),
    );
    const r = await createExpense(db, input({ category: "internet", amount: "35", brand: "eSun" }));
    expect(await brandOf(p)).toBeNull();
    expect(await brandOf(r)).toBeNull();
    const [row] = await db.select({ brand: expenses.brand }).from(expenses).where(eq(expenses.id, r));
    expect(row!.brand).toBeNull();
  });
});
