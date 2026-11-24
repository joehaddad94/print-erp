import { sql } from "drizzle-orm";
import { integer, jsonb, numeric, pgEnum, text, timestamp } from "drizzle-orm/pg-core";

/** Rule 5 + D13: every table carries these. */
export const baseColumns = () => ({
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  notes: text("notes"),
  extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
});

export const currencyEnum = pgEnum("currency", ["USD", "LBP"]);

/** Money in the entry's own currency. numeric, never float. */
export const amount = (name: string) => numeric(name, { precision: 16, scale: 4, mode: "number" });
/** USD derived values (unit costs, snapshots): more decimals so per-gram costs don't round away. */
export const usd = (name: string) => numeric(name, { precision: 16, scale: 8, mode: "number" });
/** rate_to_usd: 1 LBP ≈ 0.0000111732 USD, so it needs many decimals. */
export const rate = (name: string) => numeric(name, { precision: 24, scale: 14, mode: "number" });
/** Grams, kW, hours, percentages. */
export const qty = (name: string) => numeric(name, { precision: 14, scale: 4, mode: "number" });

