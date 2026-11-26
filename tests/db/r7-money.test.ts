import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { suppliers } from "@/db/schema";
import { expenseSchema, isPurchase } from "@/server/expenses/schema";
import { createExpense, deleteExpense, listExpenses } from "@/server/expenses/service";
import { findOrCreateSupplier, getSupplier, listSuppliers, looksLikePhone } from "@/server/suppliers/service";
import { setupTestDb } from "./helpers";

const { db } = setupTestDb();
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
const input = (o: Record<string, unknown>) => expenseSchema.parse({ spentOn: today, currency: "USD", ...o });

describe("R7 purchases and expenses", () => {
  it("splits categories: filament, packaging, machine are purchases; the rest are running costs", () => {
    expect(["filament", "packaging", "machine"].every((c) => isPurchase(c as never))).toBe(true);
    expect(
      ["electricity", "internet", "ads", "rent", "tools", "delivery", "other"].some((c) => isPurchase(c as never)),
    ).toBe(false);
  });

  it("a running cost keeps what, paid to and repeats monthly; the checkbox reads 'on' as true", async () => {
    const e = await createExpense(
      db,
      input({ category: "internet", amount: "35", description: "Fiber", paidTo: "IDM", repeatsMonthly: "on" }),
    );
    expect(input({ category: "ads", amount: "5" }).repeatsMonthly).toBe(false);
    const [row] = (await listExpenses(db)).filter((x) => x.id === e);
    expect(row).toMatchObject({ description: "Fiber", paidTo: "IDM", repeatsMonthly: true, isPurchase: false });
    expect(row!.purchaseQty).toBeNull();
    expect(await deleteExpense(db, e)).toBe("internet");
  });

  it("a filament purchase lists its grams so the unit price can be shown", async () => {
    const s = await findOrCreateSupplier(db, { name: "Spool shop", contact: null });
    await createExpense(
      db,
      input({
        category: "filament",
        amount: "17.5",
        newMaterial: "PLA",
        newColor: "Red",
        grams: "1000",
        supplierId: String(s.id),
      }),
    );
    const [row] = (await listExpenses(db)).filter((x) => x.isPurchase);
    expect(row).toMatchObject({ purchaseQty: 1000, unit: "grams", supplierName: "Spool shop" });
  });
});

describe("R7 suppliers", () => {
  it("list and page show spent, purchase count, last purchase and this year", async () => {
    const s = await findOrCreateSupplier(db, { name: "Box world", contact: null });
    for (const [amount, on] of [
      ["5", today],
      ["3", "2020-01-15"],
    ] as const)
      await createExpense(
        db,
        input({
          category: "packaging",
          amount,
          spentOn: on,
          newPackagingName: `Box ${on}`,
          pieces: "10",
          supplierId: String(s.id),
        }),
      );
    const [l] = (await listSuppliers(db)).filter((x) => x.id === s.id);
    expect(l).toMatchObject({ totalUsd: 8, purchaseCount: 2, lastPurchase: today });
    const g = await getSupplier(db, s.id);
    expect(g).toMatchObject({ totalUsd: 8, yearUsd: 5, lastPurchase: today });
    expect(g!.bought).toHaveLength(2);
    expect(await getSupplier(db, 999999)).toBeNull();
  });

  it("quick add puts a phone-like contact into phone and reuses an existing name", async () => {
    expect(looksLikePhone("+961 70 123 456")).toBe(true);
    expect(looksLikePhone("instagram.com/shop")).toBe(false);
    const a = await findOrCreateSupplier(db, { name: "Dora  Plastics", contact: "70 123 456", phone: "+96170123456" });
    const b = await findOrCreateSupplier(db, { name: "dora plastics", contact: null });
    expect(b).toMatchObject({ id: a.id, existed: true });
    const [row] = await db.select().from(suppliers).where(eq(suppliers.id, a.id));
    expect(row).toMatchObject({ name: "Dora Plastics", phone: "+96170123456", contact: null });
  });

  it("migration moves phone-only contacts into phone, leaves links and existing phones alone", async () => {
    const rows = await db
      .insert(suppliers)
      .values([
        { name: "A", contact: "03 123 456" },
        { name: "B", contact: "instagram.com/b" },
        { name: "C", contact: "+961 71 000 000", phone: "+96176000000" },
        { name: "D", contact: "71-000-111" },
      ])
      .returning();
    const update = readFileSync("drizzle/0008_r7_money.sql", "utf8")
      .split("--> statement-breakpoint")
      .find((s) => s.includes('UPDATE "suppliers"'))!;
    await db.execute(sql.raw(update));
    const after = await db.select().from(suppliers);
    const by = (n: string) => after.find((x) => x.id === rows.find((r) => r.name === n)!.id)!.phone;
    expect(by("A")).toBe("+9613123456");
    expect(by("B")).toBeNull();
    expect(by("C")).toBe("+96176000000");
    expect(by("D")).toBe("+96171000111");
  });
});
