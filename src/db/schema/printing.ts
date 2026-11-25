import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { baseColumns, qty, rate, usd } from "./_common";
import { products, recipes, stockItems } from "./inventory";
import { machines } from "./machines";

export const hoursSourceEnum = pgEnum("hours_source", ["gcode_estimate", "confirmed", "entered"]);
export const failureMethodEnum = pgEnum("failure_method", ["allowance", "actual"]);
export const gramsSourceEnum = pgEnum("grams_source", ["recipe_estimate", "override", "weighed"]);

/** Start inserts with finished_at empty; Finish completes it (D33). One running job per machine (D34). */
export const printJobs = pgTable(
  "print_jobs",
  {
    ...baseColumns(),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id),
    machineId: integer("machine_id")
      .notNull()
      .references(() => machines.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    powerCut: boolean("power_cut").notNull().default(false),
    hours: qty("hours"),
    hoursSource: hoursSourceEnum("hours_source"),
    stoppedAtPct: qty("stopped_at_pct").notNull().default(100),
    estimatedSeconds: qty("estimated_seconds"),
    // Snapshots (rule 4)
    electricityKwhPriceUsd: usd("electricity_kwh_price_usd"),
    printerPowerKw: qty("printer_power_kw"),
    machineCostPerHourUsd: usd("machine_cost_per_hour_usd"),
    failureMethod: failureMethodEnum("failure_method"),
    failureAllowancePct: qty("failure_allowance_pct"),
    recipeOverrides: jsonb("recipe_overrides").$type<Record<string, unknown>>(),
    rateToUsd: rate("rate_to_usd").notNull().default(1),
    jobCostUsd: usd("job_cost_usd"),
    wasteCostUsd: usd("waste_cost_usd"),
  },
  (t) => [
    uniqueIndex("print_jobs_one_running_per_machine_uq")
      .on(t.machineId)
      .where(sql`${t.finishedAt} is null and ${t.deletedAt} is null`),
    index("print_jobs_recipe_idx").on(t.recipeId),
    check("print_jobs_stopped_pct_range", sql`${t.stoppedAtPct} > 0 and ${t.stoppedAtPct} <= 100`),
    check("print_jobs_hours_positive", sql`${t.hours} is null or ${t.hours} > 0`),
    check(
      "print_jobs_finished_has_hours",
      sql`${t.finishedAt} is null or (${t.hours} is not null and ${t.hoursSource} is not null)`,
    ),
  ],
);

/** One line per item on the plate (D17, D20, D24). */
export const printJobItems = pgTable(
  "print_job_items",
  {
    ...baseColumns(),
    printJobId: integer("print_job_id")
      .notNull()
      .references(() => printJobs.id),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    qtyPlanned: integer("qty_planned").notNull(),
    qtyGood: integer("qty_good"),
    qtyFailed: integer("qty_failed").generatedAlwaysAs(sql`qty_planned - qty_good`),
    gramsPerPiece: qty("grams_per_piece").notNull(),
    gramsShare: qty("grams_share"),
    costShareUsd: usd("cost_share_usd"),
    unitCostUsd: usd("unit_cost_usd"),
    wasteCostUsd: usd("waste_cost_usd"),
    labourMinutesPerUnit: qty("labour_minutes_per_unit"),
  },
  (t) => [
    check("print_job_items_planned_positive", sql`${t.qtyPlanned} > 0`),
    check(
      "print_job_items_good_range",
      sql`${t.qtyGood} is null or (${t.qtyGood} >= 0 and ${t.qtyGood} <= ${t.qtyPlanned})`,
    ),
  ],
);

/** One line per filament (D10, D23). */
export const printJobFilaments = pgTable(
  "print_job_filaments",
  {
    ...baseColumns(),
    printJobId: integer("print_job_id")
      .notNull()
      .references(() => printJobs.id),
    filamentId: integer("filament_id")
      .notNull()
      .references(() => stockItems.id),
    gramsUsed: qty("grams_used").notNull(),
    gramsSource: gramsSourceEnum("grams_source").notNull(),
    weighedGrams: qty("weighed_grams"),
    /** Weighted average cost per gram at Start (D23 snapshot). */
    costPerGramUsd: usd("cost_per_gram_usd"),
  },
  (t) => [check("print_job_filaments_grams_positive", sql`${t.gramsUsed} >= 0`)],
);
