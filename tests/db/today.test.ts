import { describe, expect, it } from "vitest";
import { expenseSchema } from "@/server/expenses/schema";
import { createExpense } from "@/server/expenses/service";
import { addLine, createOrder } from "@/server/orders/service";
import { productSchema } from "@/server/products/schema";
import { createProduct } from "@/server/products/service";
import { beirutDate, dueThisWeek, monthSummary, needsYou } from "@/server/today/service";
import { setupTestDb } from "./helpers";

const { db } = setupTestDb();

const order = (dueOn: string | null) =>
  createOrder(db, {
    channel: "whatsapp",
    customerId: null,
    newCustomerName: null,
    dueOn,
    currency: "USD",
    rateToUsd: 1,
    deliveryCharge: null,
    deliveredBy: null,
    notes: null,
  });

describe("R3 Today", () => {
  it("dates are Beirut calendar days", () => {
    expect(beirutDate(new Date("2026-11-30T23:30:00Z"))).toBe("2026-12-01");
    expect(beirutDate(new Date("2026-11-30T10:00:00Z"), 2)).toBe("2026-12-02");
  });

  it("Needs you: overdue pieces to print first, then ready to deliver, then low filament", async () => {
    const now = new Date();
    const clip = await createProduct(db, productSchema.parse({ name: "Clip", kind: "product", salePriceUsd: "2" }));
    const late = await order(beirutDate(now, -1));
    await addLine(db, late, { productId: clip, quantity: 2, unitPrice: null, customization: null });
    const ready = await order(beirutDate(now, 3));
    await order(beirutDate(now, 30)); // not this week: not listed
    await createExpense(
      db,
      expenseSchema.parse({
        spentOn: "2026-11-01",
        category: "filament",
        amount: "3",
        currency: "USD",
        newMaterial: "PLA",
        newColor: "Red",
        grams: "150",
      }),
    );
    const todo = await needsYou(db, now);
    expect(todo.map((t) => t.key.replace(/-\d+$/, ""))).toEqual(["print-order", "deliver", "low"]);
    expect(todo[0]).toMatchObject({ tone: "danger", reason: "Overdue · need to print 2", href: `/orders/${late}` });
    expect(todo[1]).toMatchObject({ href: `/orders/${ready}`, action: { label: "Deliver" } });
    expect(todo[2]).toMatchObject({ reason: "150 g left", action: { label: "Buy" } });
    expect((await dueThisWeek(db, now)).map((o) => o.id)).toEqual([late, ready]);
  });

  it("month strip is zero with no delivered orders and no comparison", async () => {
    expect(await monthSummary(db)).toMatchObject({
      sales: 0,
      salesChangePct: null,
      profit: 0,
      marginPct: null,
      profitPerHour: null,
      unpaid: 0,
    });
  });
});
