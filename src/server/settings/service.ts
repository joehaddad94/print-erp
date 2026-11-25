import { and, desc, eq, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import { settings } from "@/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

/** Numeric settings shown on the Settings screen (spec: settings; D12). */
export const SETTING_KEYS = {
  electricity_kwh_price: {
    label: "Electricity price per kWh (USD)",
    hint: "Average real cost across EDL and generator (D12).",
    min: 0,
  },
  usd_lbp_rate: { label: "LBP per USD", hint: "Pre-fills the rate on LBP entries.", min: 1 },
  failure_allowance_pct: {
    label: "Failure allowance (%)",
    hint: "Used until enough prints are logged (D11).",
    min: 0,
    max: 99,
  },
  failure_actual_after_prints: { label: "Use actual failures after (prints)", hint: "Default 20.", min: 1 },
} as const;

export type SettingKey = keyof typeof SETTING_KEYS;

/** Value of each key valid at `at` (latest valid_from ≤ at). Missing keys are absent. */
export async function currentSettings(db: Db, at = new Date()): Promise<Partial<Record<string, unknown>>> {
  const rows = await db
    .select()
    .from(settings)
    .where(and(lte(settings.validFrom, at)))
    .orderBy(desc(settings.validFrom), desc(settings.id));
  const out: Record<string, unknown> = {};
  for (const r of rows) if (!(r.key in out) && !r.deletedAt) out[r.key] = r.value;
  return out;
}

export async function numberSetting(db: Db, key: SettingKey, at = new Date()): Promise<number | null> {
  const v = (await currentSettings(db, at))[key];
  return typeof v === "number" ? v : null;
}

/** Adds a dated row only when the value actually changes; old rows are never overwritten. */
export async function setSetting(db: Db, key: string, value: unknown, at = new Date()): Promise<boolean> {
  const current = (await currentSettings(db, at))[key];
  if (JSON.stringify(current) === JSON.stringify(value)) return false;
  await db.insert(settings).values({ key, value: value as never, validFrom: at });
  return true;
}

export function settingHistory(db: Db, key: string) {
  return db.select().from(settings).where(eq(settings.key, key)).orderBy(desc(settings.validFrom));
}
