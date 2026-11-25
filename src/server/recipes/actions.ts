"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { failure, formValues, validate, type FormState } from "@/server/form";
import { importSchema, overridesSchema } from "./schema";
import { findBySha, ImportError, importRecipe, updateOverrides } from "./service";

export type ImportState = {
  error?: string;
  duplicateOf?: { id: number; name: string; version: number };
  saved?: { id: number };
};

/** Step 2 of the import, after the browser uploaded the file (D14). */
export async function importRecipeAction(payload: unknown): Promise<ImportState> {
  await requireUser();
  const parsed = importSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  try {
    const r = await importRecipe(db(), parsed.data);
    revalidatePath("/recipes");
    revalidatePath("/products");
    return { saved: { id: r.id } };
  } catch (e) {
    if (e instanceof ImportError) return { error: e.message, duplicateOf: e.duplicateOf };
    return { error: "Couldn't save. Nothing was recorded. Check your connection and try again." };
  }
}

/** R-06: checked in the browser before uploading, so the same file isn't uploaded twice. */
export async function findDuplicateAction(sha: string) {
  await requireUser();
  if (!/^[0-9a-f]{64}$/.test(sha)) return null;
  return findBySha(db(), sha);
}

export async function saveOverridesAction(id: number, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(fd);
  const v = validate(overridesSchema, values);
  if (!v.ok) return v.state;
  try {
    await updateOverrides(db(), id, v.data, user.id);
  } catch (e) {
    return failure(values, e instanceof ImportError ? e.message : "Couldn't save. Nothing was changed.");
  }
  revalidatePath(`/recipes/${id}`);
  redirect(`/recipes/${id}`);
}
