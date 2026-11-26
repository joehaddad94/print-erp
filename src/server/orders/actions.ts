"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { rateToUsdFromLbpRate } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { f, failure, formValues, validate, type FormState } from "@/server/form";
import {
  addLine,
  createCustomer,
  createOrder,
  deleteLine,
  deleteOrder,
  deletePayment,
  deliver,
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
  phone: f.optionalText(40),
  handle: f.optionalText(80),
  notes: f.optionalText(),
});

export async function saveCustomerAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(fd);
  const v = validate(customerSchema, values);
  if (!v.ok) return v.state;
  try {
    if (id == null) await createCustomer(db(), v.data);
    else await updateCustomer(db(), id, v.data, user.id);
  } catch (e) {
    return fail(values, e);
  }
  refresh();
  if (id == null) return { ok: true, message: `Added ${v.data.name}.`, version: Date.now() };
  redirect(`/customers/${id}`);
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
    notes: f.optionalText(),
  })
  .superRefine(needRate);

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
  return { ok: true, message: "Payment recorded.", version: Date.now() };
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
