import { describe, expect, it } from "vitest";
import { expenseSchema } from "@/server/expenses/schema";

describe("expense form validation", () => {
  it("V-02 reports every missing field at once, not one per save", () => {
    const r = expenseSchema.safeParse({ spentOn: "2026-11-25", category: "filament", amount: "", currency: "USD" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["amount", "grams", "filamentId"]));
  });

  it("V-03 a supplier name typed in the search but never picked is refused, not dropped", () => {
    const base = { spentOn: "2026-11-25", category: "other", amount: "5", currency: "USD" };
    const r = expenseSchema.safeParse({ ...base, supplierSearch: "Shopp", supplierId: "" });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path[0])).toEqual(["supplierId"]);
    expect(expenseSchema.parse({ ...base, supplierSearch: "Shop", supplierId: "3" }).supplierId).toBe(3);
    expect(expenseSchema.parse({ ...base, supplierSearch: "", supplierId: "" }).supplierId).toBeNull();
  });
});
