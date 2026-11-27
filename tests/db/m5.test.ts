import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { orderBalance, orderItems, orders, products, stockAvailable, stockItems } from "@/db/schema";
import {
  addLine,
  createOrder,
  deleteOrder,
  deliver,
  getCustomer,
  getOrder,
  listCustomers,
  markReceived,
  OrderError,
  recordPayment,
  reserve,
  setStatus,
  updateLine,
  type OrderInput,
  type PaymentInput,
} from "@/server/orders/service";
import { currentAverage, onHand, recordMovement } from "@/server/stock/ledger";
import { setupTestDb } from "./helpers";

const { db } = setupTestDb();
const close = (a: number | null | undefined, b: number) => expect(a!).toBeCloseTo(b, 5);

const order = (o: Partial<OrderInput> = {}): OrderInput => ({
  channel: "whatsapp",
  customerId: null,
  newCustomerName: "Rami",
  dueOn: null,
  currency: "USD",
  rateToUsd: 1,
  deliveryCharge: null,
  deliveredBy: null,
  notes: null,
  ...o,
});
const pay = (amount: number, o: Partial<PaymentInput> = {}): PaymentInput => ({
  paidOn: "2026-11-25",
  amount,
  currency: "USD",
  rateToUsd: 1,
  method: "cash",
  collectedBy: null,
  reference: null,
  notes: null,
  ...o,
});

let holder: number;
let holderStock: number;
let box: number;
/** Padel holder at $5 with packaging (a box at $0.30), and `onHandQty` pieces at 0.87319 each. */
async function stock(onHandQty: number) {
  await db.transaction(async (tx) => {
    const [b] = await tx.insert(stockItems).values({ name: "Box", type: "consumable", unit: "pieces" }).returning();
    box = b!.id;
    await recordMovement(tx, { stockItemId: box, amount: 10, reason: "purchase", unitCostUsd: 0.3 });
    const [p] = await tx
      .insert(products)
      .values({ name: "Padel holder", salePriceUsd: 5, packagingItemId: box })
      .returning();
    holder = p!.id;
    const [s] = await tx
      .insert(stockItems)
      .values({ name: "Padel holder", type: "finished_product", unit: "pieces", productId: holder })
      .returning();
    holderStock = s!.id;
    if (onHandQty > 0)
      await recordMovement(tx, {
        stockItemId: holderStock,
        amount: onHandQty,
        reason: "print",
        unitCostUsd: 0.87319,
        labourMinutesPerUnit: 15,
      });
  });
}

const available = async () =>
  (await db.select().from(stockAvailable).where(eq(stockAvailable.stockItemId, holderStock)))[0]!;

beforeEach(async () => {
  await stock(2);
});

describe("O-01 sale price required (D31)", () => {
  it("a product with no price is refused with a link to set it", async () => {
    const id = await createOrder(db, order());
    const [p] = await db.insert(products).values({ name: "No price" }).returning();
    const err = await addLine(db, id, { productId: p!.id, quantity: 1, unitPrice: null, customization: null }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(OrderError);
    expect(err.message).toBe("Set a sale price for this product first");
    expect(err.link).toBe(`/products/${p!.id}`);
  });
});

describe("O-03 reserve and shortfall (D21)", () => {
  it("5 ordered, 2 available → reserved 2, need to print 3; on hand unchanged, available 0", async () => {
    const id = await createOrder(db, order());
    await addLine(db, id, { productId: holder, quantity: 5, unitPrice: null, customization: null });
    expect(await reserve(db, id)).toBe(0); // R4: adding the line already reserved the 2 free pieces
    const o = (await getOrder(db, id))!;
    expect(o.lines[0]).toMatchObject({ qtyReserved: 2, needToPrint: 3, unitPrice: 5 });
    expect(await onHand(db, holderStock)).toBe(2);
    expect((await available()).available).toBe(0);
    expect(o.fullyReserved).toBe(false);
    await expect(deliver(db, id, { deliveredBy: null, deliveryCharge: null })).rejects.toThrow(/fully reserved/);
  });
});

describe("O-06 cancel or delete releases reservations", () => {
  it("cancel releases; delete releases", async () => {
    const a = await createOrder(db, order());
    await addLine(db, a, { productId: holder, quantity: 1, unitPrice: null, customization: null });
    await reserve(db, a);
    expect((await available()).available).toBe(1);
    await setStatus(db, a, "cancelled");
    expect((await available()).available).toBe(2);
    const b = await createOrder(db, order());
    await addLine(db, b, { productId: holder, quantity: 2, unitPrice: null, customization: null });
    await reserve(db, b);
    expect((await available()).available).toBe(0);
    await deleteOrder(db, b);
    expect((await available()).available).toBe(2);
  });
});

describe("O-05/O-07 deliver and totals", () => {
  it("−stock per line, −1 box per unit, snapshots cost/packaging/minutes; delivery charge excluded", async () => {
    const id = await createOrder(db, order({ deliveryCharge: 3, deliveredBy: "Toufic" }));
    await addLine(db, id, { productId: holder, quantity: 2, unitPrice: null, customization: null });
    await reserve(db, id);
    await deliver(db, id, { deliveredBy: null, deliveryCharge: null });
    const o = (await getOrder(db, id))!;
    expect(o.status).toBe("delivered");
    expect(await onHand(db, holderStock)).toBe(0);
    expect(await onHand(db, box)).toBe(8);
    close(o.lines[0]!.unitCostUsd, 0.87319);
    close(o.lines[0]!.packagingCostPerUnitUsd, 0.3);
    expect(o.lines[0]!.labourMinutesPerUnit).toBe(15);
    close(o.balance.totalUsd, 10);
    close(o.profitUsd, 10 - 2 * 0.87319 - 2 * 0.3);
    close(o.profitPerHourUsd, (10 - 2 * 0.87319 - 0.6) / 0.5);
    expect(o.deliveryCharge).toBe(3);
  });
  it("O-02 a $0 line is allowed, still takes stock and cost, and shows the loss (D45)", async () => {
    const id = await createOrder(db, order());
    const line = await addLine(db, id, { productId: holder, quantity: 1, unitPrice: null, customization: null });
    await updateLine(db, line, { quantity: 1, unitPrice: 0, customization: "gift" });
    await reserve(db, id);
    await deliver(db, id, { deliveredBy: null, deliveryCharge: null });
    const o = (await getOrder(db, id))!;
    expect(await onHand(db, holderStock)).toBe(1);
    close(o.profitUsd, -0.87319 - 0.3);
    expect(o.balance.paymentState).toBe("paid");
  });
  it("D38 cost is the weighted average at delivery", async () => {
    await db.transaction((tx) =>
      recordMovement(tx, { stockItemId: holderStock, amount: 2, reason: "print", unitCostUsd: 1.12681 }),
    );
    close(await currentAverage(db, holderStock), 1);
    const id = await createOrder(db, order());
    await addLine(db, id, { productId: holder, quantity: 1, unitPrice: null, customization: null });
    await reserve(db, id);
    await deliver(db, id, { deliveredBy: null, deliveryCharge: null });
    close((await getOrder(db, id))!.lines[0]!.unitCostUsd, 1);
  });
});

describe("Y-01/Y-02/Y-03 payments", () => {
  it("unpaid → partly paid → paid → refund makes it unpaid again", async () => {
    const id = await createOrder(db, order());
    await addLine(db, id, { productId: holder, quantity: 1, unitPrice: null, customization: null });
    const state = async () =>
      (await db.select().from(orderBalance).where(eq(orderBalance.orderId, id)))[0]!.paymentState;
    expect(await state()).toBe("unpaid");
    await recordPayment(db, id, pay(3));
    expect(await state()).toBe("partly_paid");
    await recordPayment(db, id, pay(2));
    expect(await state()).toBe("paid");
    await recordPayment(db, id, pay(-5, { notes: "refund" }));
    expect(await state()).toBe("unpaid");
  });
  it("courier COD is held by the courier until Mark received", async () => {
    const id = await createOrder(db, order());
    await addLine(db, id, { productId: holder, quantity: 1, unitPrice: null, customization: null });
    const p = await recordPayment(db, id, pay(5, { method: "courier_cod", collectedBy: "Toufic" }));
    let b = (await getOrder(db, id))!.balance;
    expect([b.receivedUsd, b.heldByCourierUsd]).toEqual([0, 5]);
    await markReceived(db, p);
    b = (await getOrder(db, id))!.balance;
    expect([b.receivedUsd, b.heldByCourierUsd]).toEqual([5, 0]);
  });
  it("LBP payment converts at its own stored rate", async () => {
    const id = await createOrder(db, order());
    await addLine(db, id, { productId: holder, quantity: 2, unitPrice: null, customization: null });
    await recordPayment(db, id, pay(447500, { currency: "LBP", rateToUsd: 1 / 89500 }));
    close((await getOrder(db, id))!.balance.receivedUsd, 5);
  });
});

describe("Y-04 customer balance", () => {
  it("balance owed = sum of their orders' balance due; cancelled orders and quotes don't count", async () => {
    const a = await createOrder(db, order());
    const [o] = await db.select().from(orders).where(eq(orders.id, a));
    await addLine(db, a, { productId: holder, quantity: 2, unitPrice: null, customization: null });
    const b = await createOrder(db, order({ customerId: o!.customerId, newCustomerName: null }));
    await addLine(db, b, { productId: holder, quantity: 1, unitPrice: 4, customization: null });
    await recordPayment(db, b, pay(1));
    const c = await createOrder(db, order({ customerId: o!.customerId, newCustomerName: null }));
    await addLine(db, c, { productId: holder, quantity: 1, unitPrice: null, customization: null });
    await setStatus(db, c, "cancelled");
    // A quote isn't owed yet (Joe, Nov 27).
    const q = await createOrder(db, order({ customerId: o!.customerId, newCustomerName: null }));
    await addLine(db, q, { productId: holder, quantity: 1, unitPrice: 50, customization: null });
    await setStatus(db, q, "quoted");
    const cust = (await getCustomer(db, o!.customerId!))!;
    expect(cust.balanceOwedUsd).toBe(13);
    expect(cust.owingOrders).toBe(2);
    expect((await listCustomers(db))[0]!.balanceOwedUsd).toBe(13);
    expect(await db.select().from(orderItems)).toHaveLength(4);
  });
});
