import { and, asc, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import { printJobs, stockAvailable, stockItems } from "@/db/schema";
import { failureMethod } from "@/lib/cost";
import { listMachines } from "@/server/machines/service";
import { currentSettings } from "@/server/settings/service";
import { currentAverage } from "@/server/stock/ledger";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Today's cost inputs, the same ones a print started now would snapshot (D32): average cost per
 * gram per filament (D23), electricity price, each printer's power and cost per hour, and the
 * failure method in use (D11).
 */
export async function costInputs(db: Db) {
  const [filaments, machines, settings, [finished]] = await Promise.all([
    db
      .select({
        id: stockItems.id,
        name: stockItems.name,
        material: stockItems.material,
        onHand: sql<number>`coalesce(${stockAvailable.onHand}, 0)`.mapWith(Number),
      })
      .from(stockItems)
      .leftJoin(stockAvailable, eq(stockAvailable.stockItemId, stockItems.id))
      .where(and(eq(stockItems.type, "filament"), isNull(stockItems.deletedAt)))
      .orderBy(asc(stockItems.name)),
    listMachines(db),
    currentSettings(db),
    db
      .select({ n: count() })
      .from(printJobs)
      .where(and(isNotNull(printJobs.finishedAt), isNull(printJobs.deletedAt))),
  ]);
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const actualAfter = num(settings.failure_actual_after_prints) ?? 20;
  return {
    filaments: await Promise.all(
      filaments.map(async (f) => ({ ...f, costPerGramUsd: await currentAverage(db, f.id) })),
    ),
    printers: machines
      .filter((m) => m.type === "printer" && m.status === "active")
      .map((m) => ({
        id: m.id,
        name: m.name,
        model: m.model,
        nozzleMm: m.nozzleMm,
        bedXMm: m.bedXMm,
        bedYMm: m.bedYMm,
        powerKw: m.avgPowerKw,
        costPerHourUsd: m.costPerHourUsd,
      })),
    kwhPriceUsd: num(settings.electricity_kwh_price),
    allowancePct: num(settings.failure_allowance_pct) ?? 12,
    method: failureMethod(finished?.n ?? 0, actualAfter),
  };
}

export type CostInputs = Awaited<ReturnType<typeof costInputs>>;
