import { describe, expect, it } from "vitest";
import { expenseSchema } from "@/server/expenses/schema";

describe("expense form validation", () => {
  it("V-02 reports every missing field at once, not one per save", () => {
    const r = expenseSchema.safeParse({ spentOn: "2026-11-25", category: "filament", amount: "", currency: "USD" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["amount", "grams", "filamentId"]));
  });

  it("V-03 '+ New supplier…' needs a name; a picked supplier or none doesn't", () => {
    const base = { spentOn: "2026-11-25", category: "other", amount: "5", currency: "USD" };
    const missing = expenseSchema.safeParse({ ...base, supplierId: "new", newSupplierName: "  " });
    expect(missing.success).toBe(false);
    expect(missing.error!.issues.map((i) => i.path[0])).toEqual(["newSupplierName"]);
    expect(expenseSchema.parse({ ...base, supplierId: "new", newSupplierName: "Shop" }).supplierId).toBe("new");
    expect(expenseSchema.parse({ ...base, supplierId: "3" }).supplierId).toBe(3);
    expect(expenseSchema.parse({ ...base, supplierId: "" }).supplierId).toBeNull();
  });
});
