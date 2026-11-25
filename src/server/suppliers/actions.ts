"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { requireUser } from "@/server/auth/session";
import { updateLogged } from "@/server/edits/engine";
import { f, failure, formValues, validate, type FormState } from "@/server/form";

const schema = z.object({
  name: f.text("a name", 80),
  contact: f.optionalText(120),
  notes: f.optionalText(),
});

/** D30: name, contact, notes. id = null creates, otherwise edits (logged, D13). */
export async function saveSupplierAction(id: number | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(fd);
  const v = validate(schema, values);
  if (!v.ok) return v.state;
  try {
    if (id == null) await db().insert(suppliers).values(v.data);
    else await db().transaction((tx) => updateLogged(tx, suppliers, id, v.data, { userId: user.id }));
  } catch {
    return failure(values, "Couldn't save. Check your connection and try again.");
  }
  revalidatePath("/suppliers");
  if (id != null) redirect("/suppliers");
  return { ok: true, message: `Added ${v.data.name}.`, values: {}, version: Date.now() };
}
