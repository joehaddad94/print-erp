"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { failure, formValues, validate, type FormState } from "@/server/form";
import { productSchema } from "./schema";
import { saveInlineField, type InlineResult } from "@/server/inline";
import { createProduct, getProduct, updateProduct } from "./service";

/** Add (id null) or edit a product; edits are logged (D13). */
export async function saveProductAction(id: number | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(fd);
  const v = validate(productSchema, values);
  if (!v.ok) return v.state;
  let created: number | null = null;
  try {
    if (id == null) created = await createProduct(db(), v.data);
    else await updateProduct(db(), id, v.data, user.id);
  } catch {
    return failure(values, "Couldn't save. Nothing was changed. Check your connection and try again.");
  }
  revalidatePath("/products");
  // A new assembled product goes to its page, where its parts list is filled in.
  if (id == null && created != null && values.assembled === "1") redirect(`/products/${created}`);
  redirect("/products");
}

/** Product page: one click-to-edit value (name, variant, type, price, packaging), logged (D13). */
export async function updateProductFieldAction(id: number, field: string, raw: string): Promise<InlineResult> {
  const user = await requireUser();
  const p = await getProduct(db(), id);
  if (!p) return { ok: false, error: "This product was deleted." };
  const current = {
    name: p.name,
    variant: p.variant,
    kind: p.kind,
    salePriceUsd: p.salePriceUsd,
    packagingItemId: p.packagingItemId,
  };
  // A part is never sold: switching to part drops its price and packaging in the same edit.
  if (field === "kind" && raw === "part") Object.assign(current, { salePriceUsd: null, packagingItemId: null });
  const res = await saveInlineField(productSchema, current, field, raw, (data) =>
    updateProduct(db(), id, data, user.id),
  );
  if (res.ok && field === "salePriceUsd" && res.value) res.value = Number(res.value).toFixed(2);
  if (res.ok) {
    revalidatePath(`/products/${id}`);
    revalidatePath("/products");
  }
  return res;
}
