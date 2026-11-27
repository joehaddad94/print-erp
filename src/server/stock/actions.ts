"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { requireOwner, requireUser } from "@/server/auth/session";
import { f, failure, formValues, validate, type FormState } from "@/server/form";
import { ADJUST_REASONS, AdjustError, adjustStock } from "./adjust";
import { createStockItem, StockItemError } from "./items";

const schema = z.object({
  stockItemId: f.id("a stock item"),
  mode: z.enum(["weigh", "count", "delta"]),
  scaleG: f.optionalNumber("the scale reading", { min: 0 }),
  emptySpoolG: f.optionalNumber("the empty spool weight", { min: 0 }),
  count: f.optionalNumber("what you have now", { min: 0 }),
  delta: f.optionalNumber("the change"),
  reason: z.enum(ADJUST_REASONS),
  note: f.optionalText(200),
});

/** R6 Adjust stock: owner only. */
export async function adjustStockAction(_p: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const values = formValues(fd);
  const v = validate(schema, values);
  if (!v.ok) return v.state;
  try {
    const r = await adjustStock(db(), v.data, me.id);
    const u = r.unit === "grams" ? " g" : "";
    const n = (x: number) => Number(x.toFixed(1)).toLocaleString("en-US");
    for (const p of ["/", "/stock", "/history", "/print", "/orders"]) revalidatePath(p);
    redirect(
      `/stock?adjusted=${encodeURIComponent(`${r.item} set to ${n(r.measured)}${u} (${r.difference > 0 ? "+" : "−"}${n(Math.abs(r.difference))}${u}, ${v.data.reason.toLowerCase()})`)}`,
    );
  } catch (e) {
    if (e instanceof AdjustError) return failure(values, e.message);
    throw e;
  }
}

const newItemSchema = z
  .object({
    type: z.enum(["filament", "packaging", "other"]),
    material: f.optionalText(40),
    color: f.optionalText(60),
    name: f.optionalText(80),
    reorderLevel: f.optionalNumber("the warning level", { min: 0 }),
    quantity: f.optionalNumber("the quantity", { positive: true }),
    price: f.optionalNumber("the price paid", { min: 0 }),
  })
  .superRefine((v, ctx) => {
    const need = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (v.type === "filament") {
      if (!v.material) need("material", "Pick the material");
      if (!v.color) need("color", "Enter the colour");
    } else if (!v.name) need("name", "Enter a name");
    if (v.quantity != null && v.price == null) need("price", "Enter the price paid, so prints using it have a cost");
  });

/** New stock item, with an optional opening count. Opens Stock with a note of what was added. */
export async function createStockItemAction(_p: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const values = formValues(fd);
  const v = validate(newItemSchema, values);
  if (!v.ok) return v.state;
  let name: string;
  try {
    ({ name } = await createStockItem(db(), v.data));
  } catch (e) {
    return failure(values, e instanceof StockItemError ? e.message : "Couldn't save. Nothing was added. Try again.");
  }
  revalidatePath("/stock");
  redirect(`/stock?adjusted=${encodeURIComponent(`${name} added to stock`)}`);
}
