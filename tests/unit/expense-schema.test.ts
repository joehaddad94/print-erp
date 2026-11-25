import { describe, expect, it } from "vitest";
import { expenseSchema } from "@/server/expenses/schema";

describe("expense form validation", () => {
  it("V-02 reports every missing field at once, not one per save", () => {
    const r = expenseSchema.safeParse({ spentOn: "2026-11-25", category: "filament", amount: "", currency: "USD" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["amount", "grams", "filamentId"]));
  });
});
