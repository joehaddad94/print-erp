"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { contact } from "@/server/contact-fields";
import { db } from "@/db";
import { rateToUsdFromLbpRate } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { f, failure, formValues, validate, type FormState } from "@/server/form";
import { saveInlineField, type InlineResult } from "@/server/inline";
import { formatPhone } from "@/lib/phone";
import {
  addLine,
  createCustomer,
  createOrder,
  createOrderWithLines,
  deleteLine,
  deleteOrder,
  deletePayment,
  deliver,
  getCustomer,
  getOrder,
  markReceived,
  OrderError,
  recordPayment,
  takeFrom,
  type SettableStatus,
  setStatus,
  updateCustomer,
  updateLine,
  updateOrder,
} from "./service";

function refresh(orderId?: number) {
  for (const p of ["/orders", "/customers", "/stock", "/"]) revalidatePath(p);
  if (orderId) revalidatePath(`/orders/${orderId}`);
}

function fail(values: Record<string, string>, e: unknown, fallback = "Couldn't save. Nothing was changed. Try again.") {
  if (e instanceof OrderError) return { ...failure(values, e.message), link: e.link };
  return failure(values, fallback);
}

const lbp = (v: { currency: "USD" | "LBP"; lbpRate: number | null }) =>
  v.currency === "LBP" && v.lbpRate ? rateToUsdFromLbpRate(v.lbpRate) : 1;
const needRate = (v: { currency: string; lbpRate: number | null }, ctx: z.RefinementCtx) => {
  if (v.currency === "LBP" && v.lbpRate == null)
    ctx.addIssue({ code: "custom", path: ["lbpRate"], message: "Enter today's LBP per USD rate" });
};

// ── Customers
const customerSchema = z.object({
  name: f.text("a name", 80),
  phone: contact.phone(),
  handle: f.optionalText(80),
  email: contact.email(),
  area: f.optionalText(80),
  address: f.optionalText(300),
  mapUrl: contact.url(),
  notes: f.optionalText(),
});

export async function saveCustomerAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(fd);
  const v = validate(customerSchema, values);
  if (!v.ok) return v.state;
  try {
    if (id == null) id = await createCustomer(db(), v.data);
    else await updateCustomer(db(), id, v.data, user.id);
  } catch (e) {
    return fail(values, e);
  }
  refresh();
  redirect(`/customers/${id}`);
}

/** Customer page: one click-to-edit detail, validated like the form and logged (D13). */
export async function updateCustomerFieldAction(id: number, field: string, raw: string): Promise<InlineResult> {
  const user = await requireUser();
  const c = await getCustomer(db(), id);
  if (!c) return { ok: false, error: "This customer was deleted." };
  const current = {
    name: c.name,
    phone: c.phone,
    handle: c.handle,
    email: c.email,
    area: c.area,
    address: c.address,
    mapUrl: c.mapUrl,
    notes: c.notes,
  };
  const res = await saveInlineField(customerSchema, current, field, raw, (data) =>
    updateCustomer(db(), id, data, user.id),
  );
  if (res.ok && field === "phone") res.value = formatPhone(res.value ?? null);
  if (res.ok) {
    revalidatePath(`/customers/${id}`);
    revalidatePath("/customers");
  }
  return res;
}

// ── Orders
const orderSchema = z
  .object({
    channel: z.enum(["whatsapp", "instagram", "in_person", "other"]),
    customerId: f.optionalId(),
    newCustomerName: f.optionalText(80),
    dueOn: z.preprocess((v) => (v === "" ? null : v), z.iso.date({ error: "Enter the due date as a date" }).nullable()),
    currency: f.currency(),
    lbpRate: f.optionalNumber("the LBP rate", { positive: true }),
    deliveryCharge: f.optionalNumber("the delivery charge", { min: 0 }),
    deliveredBy: f.optionalText(80),
    deliveryAddress: f.optionalText(300),
    notes: f.optionalText(),
  })
  .superRefine(needRate);

function dayMonth(raw: string) {
  const m = raw.trim().match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (!m) return raw.trim();
  const year = m[3]
    ? m[3].length === 2
      ? `20${m[3]}`
      : m[3]
    : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" }).slice(0, 4);
  return `${year}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

/**
 * Order page Details (prototype /orders/1042): one click-to-edit value, validated like the form and logged.
 * Customer, channel, due date, where to deliver, delivery charge, driver, notes.
 */
export async function updateOrderFieldAction(id: number, field: string, raw: string): Promise<InlineResult> {
  const user = await requireUser();
  const o = await getOrder(db(), id);
  if (!o) return { ok: false, error: "This order was deleted." };
  if ((o.status === "delivered" || o.status === "cancelled") && field !== "notes")
    return { ok: false, error: `This order is ${o.status}. Only notes can change.` };
  const current = {
    channel: o.channel,
    customerId: o.customerId,
    newCustomerName: null,
    dueOn: o.dueOn,
    currency: o.currency,
    lbpRate: o.currency === "LBP" ? Math.round(1 / o.rateToUsd) : null,
    deliveryCharge: o.deliveryCharge,
    deliveredBy: o.deliveredBy,
    deliveryAddress: o.deliveryAddress,
    notes: o.notes,
  };
  // Due can be typed the way people say it: 27/11 or 27/11/2026 (this year when the year is left out).
  if (field === "dueOn") raw = dayMonth(raw);
  // Clearing "Deliver to" goes back to the customer's saved address.
  if (field === "deliveryAddress" && raw.trim() === (o.customer?.address ?? "").trim()) raw = "";
  let error: string | null = null;
  const res = await saveInlineField(orderSchema, current, field, raw, async (data) => {
    try {
      await updateOrder(db(), id, { ...data, rateToUsd: lbp(data) }, user.id);
    } catch (e) {
      error = e instanceof OrderError ? e.message : null;
      throw e;
    }
  });
  if (!res.ok && error) return { ok: false, error };
  if (res.ok) {
    if (field === "deliveryAddress" && !res.value) res.value = o.customer?.address ?? "";
    refresh(id);
  }
  return res;
}

export async function saveOrderAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(fd);
  const v = validate(orderSchema, values);
  if (!v.ok) return v.state;
  const input = { ...v.data, rateToUsd: lbp(v.data) };
  let orderId = id;
  try {
    if (id == null) orderId = await createOrder(db(), input);
    else await updateOrder(db(), id, input, user.id);
  } catch (e) {
    return fail(values, e);
  }
  refresh(orderId!);
  redirect(`/orders/${orderId}`);
}

const newLinesSchema = z.preprocess(
  (v) => {
    try {
      return typeof v === "string" && v ? JSON.parse(v) : [];
    } catch {
      return [];
    }
  },
  z.array(
    z.object({
      productId: z.number().int().positive(),
      quantity: z.number({ error: "Enter how many" }).int("Enter a whole number").positive("Enter at least 1"),
      unitPrice: z.number().min(0, "The price can't be negative").nullable(),
    }),
    { error: "Check the items" },
  ),
);

const newOrderSchema = z
  .object({
    channel: z.enum(["whatsapp", "instagram", "in_person", "other"]),
    status: z.enum(["quoted", "confirmed"]),
    customerId: f.optionalId(),
    newCustomerName: f.optionalText(80),
    dueOn: z.preprocess((v) => (v === "" ? null : v), z.iso.date({ error: "Enter the due date as a date" }).nullable()),
    currency: f.currency(),
    lbpRate: f.optionalNumber("the LBP rate", { positive: true }),
    notes: f.optionalText(),
    lines: newLinesSchema,
  })
  .superRefine(needRate);

/** New order (prototype /orders/new): customer, items, status and details in one save. */
export async function createOrderAction(_p: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const values = formValues(fd);
  const v = validate(newOrderSchema, values);
  if (!v.ok) return v.state;
  const { lines, ...d } = v.data;
  let orderId: number;
  try {
    orderId = await createOrderWithLines(
      db(),
      { ...d, rateToUsd: lbp(d), deliveryCharge: null, deliveredBy: null },
      lines,
    );
  } catch (e) {
    return fail(values, e);
  }
  refresh(orderId);
  redirect(`/orders/${orderId}`);
}

const lineSchema = z.object({
  productId: f.id("a product"),
  quantity: f.number("the quantity", { positive: true }).refine(Number.isInteger, "Enter a whole number"),
  unitPrice: f.optionalNumber("the price", { min: 0 }),
  customization: f.optionalText(300),
});

export async function addLineAction(orderId: number, _p: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const values = formValues(fd);
  const v = validate(lineSchema, values);
  if (!v.ok) return v.state;
  try {
    await addLine(db(), orderId, v.data);
  } catch (e) {
    return fail(values, e);
  }
  refresh(orderId);
  return { ok: true, message: "Line added.", version: Date.now() };
}

export async function updateLineAction(
  orderId: number,
  lineId: number,
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(fd);
  const v = validate(lineSchema.omit({ productId: true }), values);
  if (!v.ok) return v.state;
  try {
    await updateLine(db(), lineId, v.data, user.id);
  } catch (e) {
    return fail(values, e);
  }
  refresh(orderId);
  return { ok: true, message: "Saved.", version: Date.now() };
}

/** Order page items: click-to-edit quantity, price each or note on one line (logged, re-reserves). */
export async function updateLineFieldAction(
  orderId: number,
  lineId: number,
  field: string,
  raw: string,
): Promise<InlineResult> {
  const user = await requireUser();
  const o = await getOrder(db(), orderId);
  const l = o?.lines.find((x) => x.id === lineId);
  if (!o || !l) return { ok: false, error: "This item was removed." };
  const current = { quantity: l.quantity, unitPrice: l.unitPrice, customization: l.customization };
  let error: string | null = null;
  const res = await saveInlineField(lineSchema.omit({ productId: true }), current, field, raw, async (data) => {
    try {
      await updateLine(db(), lineId, data, user.id);
    } catch (e) {
      error = e instanceof OrderError ? e.message : null;
      throw e;
    }
  });
  if (!res.ok && error) return { ok: false, error };
  if (res.ok) refresh(orderId);
  return res;
}

export async function deleteLineAction(orderId: number, lineId: number) {
  const user = await requireUser();
  await deleteLine(db(), lineId, user.id);
  refresh(orderId);
}

/** R4 "Take N from #order". */
export async function takeFromAction(orderId: number, lineId: number, fromLineId: number) {
  const user = await requireUser();
  await takeFrom(db(), lineId, fromLineId, user.id);
  refresh(orderId);
}

export async function setStatusAction(orderId: number, status: SettableStatus) {
  const user = await requireUser();
  await setStatus(db(), orderId, status, user.id);
  refresh(orderId);
}

export async function deleteOrderAction(orderId: number) {
  const user = await requireUser();
  await deleteOrder(db(), orderId, user.id);
  refresh();
  redirect("/orders");
}

export async function deliverAction(orderId: number, _p: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const values = formValues(fd);
  const v = validate(
    z.object({ deliveredBy: f.optionalText(80), deliveryCharge: f.optionalNumber("the delivery charge", { min: 0 }) }),
    values,
  );
  if (!v.ok) return v.state;
  try {
    await deliver(db(), orderId, v.data);
  } catch (e) {
    return fail(values, e, "Couldn't deliver. Nothing was changed. Try again.");
  }
  refresh(orderId);
  return { ok: true, message: "Delivered. Stock and packaging were taken out.", version: Date.now() };
}

// ── Payments
const paymentSchema = z
  .object({
    paidOn: f.date("the date"),
    amount: f.number("the amount").refine((n) => n !== 0, "The amount can't be 0. A refund is negative."),
    currency: f.currency(),
    lbpRate: f.optionalNumber("the LBP rate", { positive: true }),
    method: z.enum(["cash", "whish", "omt", "bank_transfer", "card", "courier_cod", "other"]),
    collectedBy: f.optionalText(80),
    reference: f.optionalText(120),
    notes: f.optionalText(),
  })
  .superRefine(needRate);

export async function recordPaymentAction(orderId: number, _p: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const values = formValues(fd);
  const v = validate(paymentSchema, values);
  if (!v.ok) return v.state;
  const { lbpRate: _rate, ...rest } = v.data;
  try {
    await recordPayment(db(), orderId, { ...rest, rateToUsd: lbp(v.data) });
  } catch (e) {
    return fail(values, e);
  }
  refresh(orderId);
  redirect(`/orders/${orderId}`);
}

export async function markReceivedAction(orderId: number, paymentId: number) {
  const user = await requireUser();
  await markReceived(db(), paymentId, user.id);
  refresh(orderId);
}

export async function deletePaymentAction(orderId: number, paymentId: number) {
  const user = await requireUser();
  await deletePayment(db(), paymentId, user.id);
  refresh(orderId);
}

/** Header "Deliver" (after the confirm dialog): delivers with the driver and charge in Details. */
export async function deliverNowAction(orderId: number) {
  await requireUser();
  try {
    await deliver(db(), orderId, { deliveredBy: null, deliveryCharge: null });
  } catch (e) {
    return { ok: false as const, error: e instanceof OrderError ? e.message : "Couldn't deliver. Try again." };
  }
  refresh(orderId);
  return { ok: true as const };
}
