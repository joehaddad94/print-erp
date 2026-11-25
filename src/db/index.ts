import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __db?: Db };

/**
 * One client per server instance. `prepare: false` is required by Supabase's
 * transaction pooler (port 6543), which can't keep prepared statements.
 */
export function db(): Db {
  if (!globalForDb.__db) {
    const url = env().DATABASE_URL;
    const supabase = /\.supabase\.(com|co)$/.test(new URL(url).hostname);
    // Supabase's serverless settings: one connection per function, TLS required, and NO pipelining.
    // postgres.js otherwise sends up to 100 queries down one connection without waiting (max_pipeline),
    // which Supabase's transaction pooler doesn't support: parallel page queries (Promise.all,
    // layout + page) hang forever while a single login query works. Fail fast instead of hanging.
    const client = postgres(url, {
      prepare: false,
      max: supabase ? 1 : 5,
      max_pipeline: supabase ? 1 : 100,
      ssl: supabase ? "require" : undefined,
      connect_timeout: 10,
      idle_timeout: 20,
    });
    globalForDb.__db = drizzle(client, { schema, casing: undefined });
  }
  return globalForDb.__db;
}

export { schema };
