import { sql } from "drizzle-orm";
import { check, date, index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { amount, baseColumns, currencyEnum, qty, rate, usd } from "./_common";
import { products } from "./inventory";
import { paymentMethodEnum } from "./purchasing";

export const orderChannelEnum = pgEnum("order_channel", ["whatsapp", "instagram", "in_person", "other"]);
export const orderStatusEnum = pgEnum("order_status", [
  "quoted",
  "confirmed",
  "printing",
  "ready",
  "delivered",
  "cancelled",
]);

/** Who buys (D30). */
export const customers = pgTable("customers", {
  ...baseColumns(),
  name: text("name").notNull(),
  /** R5: E.164, e.g. +96170123456 (shown as +961 70 123 456). */
  phone: text("phone"),
  /** Instagram or other handle. */
  handle: text("handle"),
  email: text("email"),
  area: text("area"),
  address: text("address"),
  /** A map link (Google Maps) the driver opens. */
  mapUrl: text("map_url"),
});

/** The sale (D28). Total = sum of lines; delivery charge is the driver's (D37). */
export const orders = pgTable(
  "orders",
  {
    ...baseColumns(),
    channel: orderChannelEnum("channel").notNull().default("whatsapp"),
    customerId: integer("customer_id").references(() => customers.id),
    status: orderStatusEnum("status").notNull().default("confirmed"),
    dueOn: date("due_on"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    currency: currencyEnum("currency").notNull().default("USD"),
    rateToUsd: rate("rate_to_usd").notNull().default(1),
    deliveredBy: text("delivered_by"),
    /** Where this order goes when it isn't the customer's saved address. Null = the customer's address. */
    deliveryAddress: text("delivery_address"),
    /** Reference only, for the driver; never in totals (D37). */
    deliveryCharge: amount("delivery_charge"),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    check("orders_rate_positive", sql`${t.rateToUsd} > 0`),
    check("orders_delivered_has_time", sql`${t.status} <> 'delivered' or ${t.deliveredAt} is not null`),
  ],
);

/** Order lines (D18, D21, D31, D45). */
export const orderItems = pgTable(
  "order_items",
  {
    ...baseColumns(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    customization: text("customization"),
    unitPrice: amount("unit_price").notNull(),
    qtyReserved: integer("qty_reserved").notNull().default(0),
    packagingCostPerUnitUsd: usd("packaging_cost_per_unit_usd"),
    unitCostUsd: usd("unit_cost_usd"),
    labourMinutesPerUnit: qty("labour_minutes_per_unit"),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    check("order_items_qty_positive", sql`${t.quantity} > 0`),
    check("order_items_price_not_negative", sql`${t.unitPrice} >= 0`),
    check("order_items_reserved_range", sql`${t.qtyReserved} >= 0 and ${t.qtyReserved} <= ${t.quantity}`),
  ],
);

/** The collection (D28). A refund is a negative amount. Cash counts on received_at. */
export const payments = pgTable(
  "payments",
  {
    ...baseColumns(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id),
    paidOn: date("paid_on").notNull().defaultNow(),
    amount: amount("amount").notNull(),
    currency: currencyEnum("currency").notNull().default("USD"),
    rateToUsd: rate("rate_to_usd").notNull().default(1),
    method: paymentMethodEnum("method").notNull().default("cash"),
    collectedBy: text("collected_by"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    reference: text("reference"),
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    check("payments_rate_positive", sql`${t.rateToUsd} > 0`),
    check("payments_not_zero", sql`${t.amount} <> 0`),
  ],
);
