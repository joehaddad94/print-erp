import { readFileSync } from "node:fs";
import { asc, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { customers, products } from "@/db/schema";
import { addLine, createCustomer, createOrder, getCustomer, listCustomers } from "@/server/orders/service";
import { setupTestDb } from "./helpers";

const { db } = setupTestDb();

describe("R5 migration: phones become E.164", () => {
  it("rewrites Lebanese and international numbers, leaves anything else as typed", async () => {
    const typed = ["70 123 456", "+961 71-222-333", "0096176000000", "03123456", "+33 6 12 34 56 78", "ask Rami"];
    for (const [i, phone] of typed.entries()) await db.insert(customers).values({ name: `C${i}`, phone });
    const update = readFileSync("drizzle/0007_r5_customer_details.sql", "utf8")
      .split("--> statement-breakpoint")
      .find((s) => s.includes('UPDATE "customers"'))!;
    await db.execute(sql.raw(update));
    const rows = await db.select({ phone: customers.phone }).from(customers).orderBy(asc(customers.id));
    expect(rows.map((r) => r.phone)).toEqual([
      "+96170123456",
      "+96171222333",
      "+96176000000",
      "+9613123456",
      "+33612345678",
      "ask Rami",
    ]);
  });
});

describe("R5 customer page numbers", () => {
  it("owed, open orders and new fields", async () => {
    const id = await createCustomer(db, {
      name: "Karim",
      phone: "+96170123456",
      handle: null,
      notes: null,
      email: "karim@example.com",
      area: "Achrafieh",
      address: "Sursock St",
      mapUrl: "https://maps.app.goo.gl/x",
    });
    const [p] = await db.insert(products).values({ name: "Clip", salePriceUsd: 4 }).returning();
    const o = await createOrder(db, {
      channel: "whatsapp",
      customerId: id,
      newCustomerName: null,
      dueOn: "2026-12-01",
      currency: "USD",
      rateToUsd: 1,
      deliveryCharge: null,
      deliveredBy: null,
      notes: null,
    });
    await addLine(db, o, { productId: p!.id, quantity: 2, unitPrice: null, customization: null });
    const c = (await getCustomer(db, id))!;
    expect(c).toMatchObject({
      email: "karim@example.com",
      area: "Achrafieh",
      mapUrl: "https://maps.app.goo.gl/x",
      balanceOwedUsd: 8,
      owingOrders: 1,
      deliveredCount: 0,
      profitUsd: 0,
    });
    expect(c.openOrders.map((x) => x.id)).toEqual([o]);
    const [row] = await listCustomers(db);
    expect(row).toMatchObject({ area: "Achrafieh", email: "karim@example.com", orderCount: 1 });
    expect(row!.lastOrderAt).not.toBeNull();
  });
});
