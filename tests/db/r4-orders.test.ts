import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { orderItems, products, stockItems } from "@/db/schema";
import {
  addLine,
  createOrder,
  deleteLine,
  donorsFor,
  getOrder,
  listOrders,
  setStatus,
  shownStatus,
  takeFrom,
  updateLine,
} from "@/server/orders/service";
import { recordMovement } from "@/server/stock/ledger";
import { setupTestDb } from "./helpers";

const { db } = setupTestDb();

let clip: number;
beforeEach(async () => {
  const [p] = await db.insert(products).values({ name: "Clip", salePriceUsd: 2 }).returning();
  clip = p!.id;
  const [s] = await db
    .insert(stockItems)
    .values({ name: "Clip", type: "finished_product", unit: "pieces", productId: clip })
    .returning();
  await db.transaction((tx) =>
    recordMovement(tx, { stockItemId: s!.id, amount: 3, reason: "print", unitCostUsd: 0.5 }),
  );
});

const order = (dueOn: string | null = null) =>
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
const line = (orderId: number, quantity: number) =>
  addLine(db, orderId, { productId: clip, quantity, unitPrice: null, customization: null });
const reserved = async (id: number) =>
  (await db.select().from(orderItems).where(eq(orderItems.id, id)))[0]!.qtyReserved;

describe("R4 auto-reserve", () => {
  it("a confirmed order reserves as items are added; Ready turns on by itself", async () => {
    const o = await order();
    const l = await line(o, 2);
    expect(await reserved(l)).toBe(2);
    const [row] = await listOrders(db);
    expect(shownStatus(row!)).toBe("Ready");
  });

  it("a quote holds no stock; confirming reserves; back to quoted frees the pieces for the next order", async () => {
    const q = await order("2026-12-01");
    await setStatus(db, q, "quoted");
    const ql = await line(q, 2);
    expect(await reserved(ql)).toBe(0);
    await setStatus(db, q, "confirmed");
    expect(await reserved(ql)).toBe(2);
    const other = await order("2026-12-05");
    const ol = await line(other, 3);
    expect(await reserved(ol)).toBe(1);
    await setStatus(db, q, "quoted");
    expect([await reserved(ql), await reserved(ol)]).toEqual([0, 3]);
  });

  it("cancelling, removing a line or lowering a quantity hands the pieces on", async () => {
    const a = await order("2026-12-01");
    const al = await line(a, 3);
    const b = await order("2026-12-02");
    const bl = await line(b, 2);
    expect(await reserved(bl)).toBe(0);
    await updateLine(db, al, { quantity: 2, unitPrice: null, customization: null });
    expect(await reserved(bl)).toBe(1);
    await deleteLine(db, al);
    expect(await reserved(bl)).toBe(2);
    const c = await order("2026-12-03");
    const cl = await line(c, 1);
    await setStatus(db, b, "cancelled");
    expect(await reserved(cl)).toBe(1);
  });
});

describe("R4 Take N from #order", () => {
  it("offers the order due last and moves its pieces", async () => {
    const later = await order("2026-12-20");
    const ll = await line(later, 3);
    const urgent = await order("2026-11-28");
    const ul = await line(urgent, 2);
    expect(await reserved(ul)).toBe(0);
    const donor = (await donorsFor(db, urgent)).get(ul);
    expect(donor).toMatchObject({ fromLineId: ll, fromOrderId: later, dueOn: "2026-12-20", reserved: 3 });
    expect(await takeFrom(db, ul, ll)).toBe(2);
    expect([await reserved(ul), await reserved(ll)]).toEqual([2, 1]);
    const o = await getOrder(db, later);
    expect(o!.lines[0]!.needToPrint).toBe(2);
  });

  it("refuses other products and the same order", async () => {
    const a = await order();
    const al = await line(a, 1);
    await expect(takeFrom(db, al, al)).rejects.toThrow(/same product/);
  });
});
