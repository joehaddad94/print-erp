"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { f, formValues, validate, type FormState } from "@/server/form";
import { setSetting } from "./service";

const schema = z.object({
  electricity_kwh_price: f.optionalNumber("the electricity price", { positive: true }),
  usd_lbp_rate: f.optionalNumber("the LBP rate", { positive: true }),
  failure_allowance_pct: f.number("the failure allowance", { min: 0, max: 99 }),
  failure_actual_after_prints: f.number("the number of prints", { min: 1 }),
});

export async function saveSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const values = formValues(fd);
  const v = validate(schema, values);
  if (!v.ok) return v.state;
  let changed = 0;
  for (const [key, value] of Object.entries(v.data)) {
    if (value == null) continue;
    if (await setSetting(db(), key, value)) changed++;
  }
  revalidatePath("/settings");
  return {
    ok: true,
    message: changed ? `Saved. ${changed} value${changed > 1 ? "s" : ""} changed from now on.` : "Nothing changed.",
    values,
    version: Date.now(),
  };
}
