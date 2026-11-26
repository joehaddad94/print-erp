import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "./_common";

/** R1: Owner can do everything; Staff can't adjust stock, download backups, see Change history or manage people. */
export const userRoleEnum = pgEnum("user_role", ["owner", "staff"]);

/** D42: username + password only. Throttle columns implement "repeated wrong passwords are slowed down". */
export const users = pgTable(
  "users",
  {
    ...baseColumns(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    failedLogins: integer("failed_logins").notNull().default(0),
    lastFailedLoginAt: timestamp("last_failed_login_at", { withTimezone: true }),
    role: userRoleEnum("role").notNull().default("staff"),
    /** Set when the app generated the password (new person, reset): changed at next sign-in. */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
  },
  (t) => [uniqueIndex("users_username_uq").on(sql`lower(${t.username})`)],
);

/** Dated inputs, one row per change, never overwritten (spec: settings). */
export const settings = pgTable(
  "settings",
  {
    ...baseColumns(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("settings_key_valid_from_uq").on(t.key, t.validFrom)],
);

export const editActionEnum = pgEnum("edit_action", ["edit", "delete"]);

/** D13: one row per changed field. */
export const editLog = pgTable(
  "edit_log",
  {
    ...baseColumns(),
    tableName: text("table_name").notNull(),
    rowId: integer("row_id").notNull(),
    field: text("field").notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason"),
    action: editActionEnum("action").notNull().default("edit"),
    editedBy: integer("edited_by").references(() => users.id),
  },
  (t) => [index("edit_log_row_idx").on(t.tableName, t.rowId), index("edit_log_edited_at_idx").on(t.editedAt)],
);
