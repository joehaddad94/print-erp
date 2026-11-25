import { describe, expect, it } from "vitest";
import { assemblies, products } from "@/db/schema";
import {
  addPart,
  assemble,
  assemblyPlan,
  changeHistory,
  partsShortfall,
  stockFor,
  stockList,
} from "@/server/assembly/service";
import { addLine, createOrder } from "@/server/orders/service";
import { productSchema } from "@/server/products/schema";
import { createProduct, updateProduct } from "@/server/products/service";
import { currentAverage, onHand, recordMovement } from "@/server/stock/ledger";
import { setupTestDb } from "./helpers";

const { db } = setupTestDb();
const close = (a: number | null | undefined, b: number) => expect(a!).toBeCloseTo(b, 5);

async function kit() {
  const [stand] = await db.insert(products).values({ name: "Stand", salePriceUsd: 12 }).returning();
  const [a] = await db.insert(products).values({ name: "Leg", kind: "part" }).returning();
  const [b] = await db.insert(products).values({ name: "Top", kind: "part" }).returning();
  await addPart(db, stand!.id, a!.id, 2);
  await addPart(db, stand!.id, b!.id, 1);
  const legStock = await stockFor(db, a!.id);
  const topStock = await stockFor(db, b!.id);
  await db.transaction(async (tx) => {
    await recordMovement(tx, {
      stockItemId: legStock,
      amount: 10,
      reason: "print",
      unitCostUsd: 0.5,
      labourMinutesPerUnit: 2,
    });
    await recordMovement(tx, {
      stockItemId: topStock,
      amount: 2,
      reason: "print",
      unitCostUsd: 1.2,
      labourMinutesPerUnit: 3,
    });
  });
  return { stand: stand!.id, leg: legStock, top: topStock };
}

describe("B-01 assemble", () => {
  it("3 stands with 2 legs each → legs −6, stand +3 at Σ(part avg × qty), minutes include parts", async () => {
    const k = await kit();
    const a = await assemble(db, {
      productId: k.stand,
      qty: 3,
      assemblyMinutesPerUnit: 5,
      assembledOn: "2026-11-25",
      notes: null,
    });
    expect(await onHand(db, k.leg)).toBe(4);
    expect(await onHand(db, k.top)).toBe(-1); // D36: allowed, shown red
    const standStock = await stockFor(db, k.stand);
    expect(await onHand(db, standStock)).toBe(3);
    close(a.unitCostUsd, 2 * 0.5 + 1.2);
    close(await currentAverage(db, standStock), 2.2);
    expect(await db.select().from(assemblies)).toHaveLength(1);
    const list = await stockList(db);
    expect(list.find((s) => s.id === k.top)!.onHand).toBe(-1);
  });
  it("B-02 the plan shows what's short before saving", async () => {
    const k = await kit();
    const plan = await assemblyPlan(db, k.stand, 3);
    expect(plan.map((p) => [p.name, p.needed, p.onHand, p.short])).toEqual([
      ["Leg", 6, 10, 0],
      ["Top", 3, 2, 1],
    ]);
  });
});

describe("B-03 shortfall lists parts for an assembled product", () => {
  it("order of 2 stands with none in stock → 4 legs and 2 tops needed", async () => {
    const k = await kit();
    const id = await createOrder(db, {
      channel: "whatsapp",
      customerId: null,
      newCustomerName: null,
      dueOn: null,
      currency: "USD",
      rateToUsd: 1,
      deliveryCharge: null,
      deliveredBy: null,
      notes: null,
    });
    await addLine(db, id, { productId: k.stand, quantity: 2, unitPrice: null, customization: null });
    const s = await partsShortfall(db, id);
    expect(s.map((x) => [x.partName, x.needed, x.available])).toEqual([
      ["Leg", 4, 10],
      ["Top", 2, 2],
    ]);
  });
});

describe("H-01 change history", () => {
  it("lists edits newest first with old → new and a link", async () => {
    const id = await createProduct(db, productSchema.parse({ name: "Clip", kind: "product", salePriceUsd: "2" }));
    await updateProduct(db, id, productSchema.parse({ name: "Clip", kind: "product", salePriceUsd: "3" }));
    await updateProduct(db, id, productSchema.parse({ name: "Clip XL", kind: "product", salePriceUsd: "3" }));
    const h = await changeHistory(db);
    expect(h.map((r) => [r.field, r.oldValue, r.newValue])).toEqual([
      ["name", "Clip", "Clip XL"],
      ["sale_price_usd", 2, 3],
    ]);
    expect(h[0]!.href).toBe(`/products/${id}`);
    expect(await changeHistory(db, { table: "orders" })).toHaveLength(0);
  });
});
