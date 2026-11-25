import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, timestamp } from "drizzle-orm/pg-core";
import { baseColumns, qty, usd } from "./_common";
import { adjustments, assemblies, stockItems } from "./inventory";
import { printJobFilaments, printJobItems, printJobs } from "./printing";
import { expenses } from "./purchasing";
import { orderItems } from "./sales";

export const movementReasonEnum = pgEnum("movement_reason", [
  "print",
  "assembly_in",
  "assembly_out",
  "sale",
  "purchase",
  "weigh_in",
  "count",
  "waste",
]);

/** The only source of quantities, and of average cost (D23, D38). */
export const stockMovements = pgTable(
  "stock_movements",
  {
    ...baseColumns(),
    stockItemId: integer("stock_item_id")
      .notNull()
      .references(() => stockItems.id),
    amount: qty("amount").notNull(),
    reason: movementReasonEnum("reason").notNull(),
    movedAt: timestamp("moved_at", { withTimezone: true }).notNull().defaultNow(),
    printJobId: integer("print_job_id").references(() => printJobs.id),
    printJobItemId: integer("print_job_item_id").references(() => printJobItems.id),
    printJobFilamentId: integer("print_job_filament_id").references(() => printJobFilaments.id),
    assemblyId: integer("assembly_id").references(() => assemblies.id),
    orderItemId: integer("order_item_id").references(() => orderItems.id),
    adjustmentId: integer("adjustment_id").references(() => adjustments.id),
    expenseId: integer("expense_id").references(() => expenses.id),
    /** On every movement that adds pieces or grams (USD per piece or per gram). */
    unitCostUsd: usd("unit_cost_usd"),
    labourMinutesPerUnit: qty("labour_minutes_per_unit"),
    /** Weighted average cost of the item after this movement; maintained by lib/cost (plan §3.10). */
    avgUnitCostAfterUsd: usd("avg_unit_cost_after_usd"),
  },
  (t) => [
    index("stock_movements_item_time_idx").on(t.stockItemId, t.movedAt),
    check("stock_movements_amount_not_zero", sql`${t.amount} <> 0`),
    check(
      "stock_movements_in_has_cost",
      sql`${t.amount} < 0 or ${t.reason} in ('weigh_in','count') or ${t.unitCostUsd} is not null`,
    ),
  ],
);
