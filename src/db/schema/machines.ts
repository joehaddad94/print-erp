import { sql } from "drizzle-orm";
import { check, date, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { amount, baseColumns, currencyEnum, qty, rate } from "./_common";

export const machineTypeEnum = pgEnum("machine_type", ["printer", "equipment"]);
export const machineStatusEnum = pgEnum("machine_status", ["active", "retired"]);

/** Machine stock (D9). Cost per hour = purchase cost (USD) ÷ expected life (D27). Power per machine (D26). */
export const machines = pgTable(
  "machines",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    type: machineTypeEnum("type").notNull(),
    model: text("model"),
    boughtOn: date("bought_on"),
    purchaseAmount: amount("purchase_amount"),
    purchaseCurrency: currencyEnum("purchase_currency").notNull().default("USD"),
    purchaseRateToUsd: rate("purchase_rate_to_usd").notNull().default(1),
    expectedLifeHours: qty("expected_life_hours"),
    avgPowerKw: qty("avg_power_kw"),
    nozzleMm: qty("nozzle_mm"),
    bedXMm: integer("bed_x_mm"),
    bedYMm: integer("bed_y_mm"),
    status: machineStatusEnum("status").notNull().default("active"),
  },
  (t) => [
    check("machines_rate_positive", sql`${t.purchaseRateToUsd} > 0`),
    check("machines_life_positive", sql`${t.expectedLifeHours} is null or ${t.expectedLifeHours} > 0`),
    check("machines_power_positive", sql`${t.avgPowerKw} is null or ${t.avgPowerKw} > 0`),
  ],
);
