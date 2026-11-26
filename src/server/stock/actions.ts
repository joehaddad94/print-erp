"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { requireOwner } from "@/server/auth/session";
import { f, failure, formValues, validate, type FormState } from "@/server/form";
import { ADJUST_REASONS, AdjustError, adjustStock } from "./adjust";

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
