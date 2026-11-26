import { sql } from "drizzle-orm";
import { boolean, check, date, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { amount, baseColumns, currencyEnum, rate } from "./_common";
import { stockItems } from "./inventory";
import { machines } from "./machines";

export const expenseCategoryEnum = pgEnum("expense_category", [
  "filament",
  "packaging",
  "machine",
  "electricity",
  "delivery",
  "other",
  // R7 running costs
  "internet",
  "ads",
  "rent",
  "tools",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "whish",
  "omt",
  "bank_transfer",
  "card",
  "courier_cod",
  "other",
]);

/** Who you buy from (D30). */
export const suppliers = pgTable("suppliers", {
  ...baseColumns(),
  name: text("name").notNull(),
  /** Before R7: free text. R7 copies phone-like values to `phone`. */
  contact: text("contact"),
  /** R7: E.164, the same format as customers. */
  phone: text("phone"),
  /** What they sell, for search ("boxes" finds them). */
  sells: text("sells"),
  email: text("email"),
  website: text("website"),
  area: text("area"),
  address: text("address"),
  mapUrl: text("map_url"),
});

/** Money out. Filament, packaging and machine categories create stock or a machine in the same transaction (D9). */
export const expenses = pgTable(
  "expenses",
  {
    ...baseColumns(),
    spentOn: date("spent_on").notNull().defaultNow(),
    category: expenseCategoryEnum("category").notNull(),
    amount: amount("amount").notNull(),
    currency: currencyEnum("currency").notNull().default("USD"),
    rateToUsd: rate("rate_to_usd").notNull().default(1),
    paymentMethod: paymentMethodEnum("payment_method"),
    description: text("description"),
    supplierId: integer("supplier_id").references(() => suppliers.id),
    stockItemId: integer("stock_item_id").references(() => stockItems.id),
    machineId: integer("machine_id").references(() => machines.id),
    /** R7 running costs: who was paid (IDM, the generator owner). */
    paidTo: text("paid_to"),
    /** R7: repeats every month (internet, generator). */
    repeatsMonthly: boolean("repeats_monthly").notNull().default(false),
    /**
     * Filament purchases only: who made it (eSun, Sunlu). Not part of the filament's identity:
     * stock and the weighted average stay per material + colour (D23). For "cheapest brand" later.
     */
    brand: text("brand"),
  },
  (t) => [
    check("expenses_rate_positive", sql`${t.rateToUsd} > 0`),
    check("expenses_usd_rate_is_one", sql`${t.currency} <> 'USD' or ${t.rateToUsd} = 1`),
  ],
);
