import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "./schema";
import { machines, settings } from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

/** Defaults from the spec. No electricity price: Joe enters it in Settings (spec, v0.1 build step 4). */
export const DEFAULT_SETTINGS: Record<string, unknown> = {
  failure_allowance_pct: 12,
  failure_actual_after_prints: 20,
  recipe_grams_tolerance: { grams: 2, pct: 2 },
};

export const SEED_PRINTER = {
  name: "Ender-3 V3 SE",
  type: "printer" as const,
  model: "Creality Ender-3 V3 SE",
  expectedLifeHours: 3000, // D27
  avgPowerKw: 0.12, // D26, D39 (final, Joe Nov 24)
  nozzleMm: 0.4,
  bedXMm: 220,
  bedYMm: 220,
};

/** Idempotent: safe on every deploy. Never overwrites values Joe changed. */
export async function seed(db: Db) {
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      const existing = await tx.select({ id: settings.id }).from(settings).where(eq(settings.key, key)).limit(1);
      if (existing.length === 0) await tx.insert(settings).values({ key, value });
    }
    const printer = await tx
      .select({ id: machines.id })
      .from(machines)
      .where(and(eq(machines.model, SEED_PRINTER.model), isNull(machines.deletedAt)))
      .limit(1);
    if (printer.length === 0) await tx.insert(machines).values(SEED_PRINTER);
  });
}
