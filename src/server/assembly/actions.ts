"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { f, failure, formValues, validate, type FormState } from "@/server/form";
import { addPart, assemble, AssemblyError, removePart } from "./service";

export async function addPartAction(productId: number, _p: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const values = formValues(fd);
  const v = validate(
    z.object({ partId: f.id("a part"), qtyPerProduct: f.number("the quantity", { positive: true }) }),
    values,
  );
  if (!v.ok) return v.state;
  try {
    await addPart(db(), productId, v.data.partId, v.data.qtyPerProduct);
  } catch (e) {
    return failure(values, e instanceof AssemblyError ? e.message : "Couldn't save. Try again.");
  }
  revalidatePath(`/products/${productId}`);
  return { ok: true, message: "Part added.", version: Date.now() };
}

export async function removePartAction(productId: number, id: number) {
  const user = await requireUser();
  await removePart(db(), id, user.id);
  revalidatePath(`/products/${productId}`);
}

export async function assembleAction(_p: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const values = formValues(fd);
  const v = validate(
    z.object({
      productId: f.id("a product"),
      qty: f.number("how many you made", { positive: true }).refine(Number.isInteger, "Enter a whole number"),
      assemblyMinutesPerUnit: f.optionalNumber("the minutes", { min: 0 }),
      assembledOn: f.date("the date"),
      notes: f.optionalText(),
    }),
    values,
  );
  if (!v.ok) return v.state;
  try {
    await assemble(db(), v.data);
  } catch (e) {
    return failure(values, e instanceof AssemblyError ? e.message : "Couldn't save. Nothing was recorded. Try again.");
  }
  for (const p of ["/assemble", "/stock", "/"]) revalidatePath(p);
  return { ok: true, message: `Saved: ${v.data.qty} made. Parts taken out of stock.`, version: Date.now() };
}
