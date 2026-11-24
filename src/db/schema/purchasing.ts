import { sql } from "drizzle-orm";
import { check, date, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
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
  contact: text("contact"),
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
  },
  (t) => [
    check("expenses_rate_positive", sql`${t.rateToUsd} > 0`),
    check("expenses_usd_rate_is_one", sql`${t.currency} <> 'USD' or ${t.rateToUsd} = 1`),
  ],
);
