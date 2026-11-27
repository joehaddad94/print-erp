"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { f, formValues, validate, type FormState } from "@/server/form";
import { saveInlineField, type InlineResult } from "@/server/inline";
import { currentSettings, DEFAULTS, setSetting } from "./service";

const schema = z.object({
  electricity_kwh_price: f.optionalNumber("the electricity price", { positive: true }),
  usd_lbp_rate: f.optionalNumber("the LBP rate", { positive: true }),
  failure_allowance_pct: f.number("the failure allowance", { min: 0, max: 99 }),
  failure_actual_after_prints: f.number("the number of prints", { min: 1 }),
});

export async function saveSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const values = formValues(fd);
  const v = validate(schema, values);
  if (!v.ok) return v.state;
  let changed = 0;
  for (const [key, value] of Object.entries(v.data)) {
    if (value == null) continue;
    if (await setSetting(db(), key, value, new Date(), { userId: me.id })) changed++;
  }
  revalidatePath("/settings");
  return {
    ok: true,
    message: changed ? `Saved. ${changed} value${changed > 1 ? "s" : ""} changed from now on.` : "Nothing changed.",
    values,
    version: Date.now(),
  };
}

/** One field's rule, the same as the Costs form above, plus the Defaults panel. */
const fieldSchemas = {
  electricity_kwh_price: f.number("the electricity price", { positive: true }),
  usd_lbp_rate: f.number("the LBP rate", { positive: true }),
  failure_allowance_pct: f.number("the failure allowance", { min: 0, max: 99 }),
  failure_actual_after_prints: f.number("the number of prints", { min: 1 }),
  default_currency: z.enum(["USD", "LBP"], { error: "Pick USD or LBP" }),
  phone_country: z.enum(["LB"], { error: "Only Lebanon +961 for now" }),
  low_filament_g: f.number("the grams", { min: 0 }),
  shop_name: f.text("a shop name", 40),
} as const;
const fallback: Record<string, unknown> = {
  default_currency: DEFAULTS.currency,
  phone_country: DEFAULTS.phoneCountry,
  low_filament_g: DEFAULTS.lowFilamentG,
  shop_name: DEFAULTS.shopName,
};

/** Settings page: one click-to-edit value. A cost setting gets a new dated row (past prints keep theirs). */
export async function updateSettingAction(key: string, raw: string): Promise<InlineResult> {
  const me = await requireUser();
  if (!(key in fieldSchemas)) return { ok: false, error: "This value can't be changed here." };
  const k = key as keyof typeof fieldSchemas;
  const current = await currentSettings(db());
  const res = await saveInlineField(
    z.object({ [k]: fieldSchemas[k] }),
    { [k]: current[k] ?? fallback[k] ?? "" },
    k,
    raw,
    (data) => setSetting(db(), k, (data as Record<string, unknown>)[k], new Date(), { userId: me.id }),
  );
  if (res.ok) revalidatePath("/", "layout");
  return res;
}
