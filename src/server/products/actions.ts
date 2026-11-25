"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { failure, formValues, validate, type FormState } from "@/server/form";
import { productSchema } from "./schema";
import { createProduct, updateProduct } from "./service";

/** Add (id null) or edit a product; edits are logged (D13). */
export async function saveProductAction(id: number | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(fd);
  const v = validate(productSchema, values);
  if (!v.ok) return v.state;
  try {
    if (id == null) await createProduct(db(), v.data);
    else await updateProduct(db(), id, v.data, user.id);
  } catch {
    return failure(values, "Couldn't save. Nothing was changed. Check your connection and try again.");
  }
  revalidatePath("/products");
  redirect("/products");
}
