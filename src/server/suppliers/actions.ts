"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { normalizePhone } from "@/lib/phone";
import { requireUser } from "@/server/auth/session";
import { contact } from "@/server/contact-fields";
import { updateLogged } from "@/server/edits/engine";
import { f, failure, formValues, validate, type FormState } from "@/server/form";
import { findOrCreateSupplier, looksLikePhone } from "./service";

const schema = z.object({
  name: f.text("a name", 80),
  phone: contact.phone(),
  sells: f.optionalText(120),
  email: contact.email(),
  website: contact.url(300),
  area: f.optionalText(80),
  address: f.optionalText(300),
  mapUrl: contact.url(),
  notes: f.optionalText(),
});

/** R7 supplier details. id = null creates, otherwise edits (logged, D13). Opens the supplier after. */
export async function saveSupplierAction(id: number | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(fd);
  const v = validate(schema, values);
  if (!v.ok) return v.state;
  let savedId = id;
  try {
    if (id == null) {
      const [row] = await db().insert(suppliers).values(v.data).returning({ id: suppliers.id });
      savedId = row!.id;
    } else await db().transaction((tx) => updateLogged(tx, suppliers, id, v.data, { userId: user.id }));
  } catch {
    return failure(values, "Couldn't save. Check your connection and try again.");
  }
  revalidatePath("/suppliers");
  redirect(`/suppliers/${savedId}`);
}

export type QuickSupplierResult =
  { ok: true; id: number; name: string; existed: boolean } | { ok: false; error: string; field?: "name" | "contact" };

/** "+ New supplier" on the purchase form: saves straight away so the form can pick it. */
export async function quickAddSupplierAction(name: string, contactText: string): Promise<QuickSupplierResult> {
  await requireUser();
  const v = z
    .object({ name: f.text("a name", 80), contact: f.optionalText(120) })
    .safeParse({ name, contact: contactText });
  if (!v.success) {
    const issue = v.error.issues[0]!;
    return { ok: false, error: issue.message, field: issue.path[0] === "contact" ? "contact" : "name" };
  }
  const c = v.data.contact;
  const p = c && looksLikePhone(c) ? normalizePhone(c) : null;
  try {
    const s = await findOrCreateSupplier(db(), { name: v.data.name, contact: c, phone: p?.ok ? p.e164 : null });
    revalidatePath("/suppliers");
    return { ok: true, ...s };
  } catch {
    return { ok: false, error: "Couldn't save the supplier. Check your connection and try again." };
  }
}
