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
    // Fail fast instead of hanging: an unreachable or misconfigured database errors within 10 s.
    const client = postgres(env().DATABASE_URL, { prepare: false, max: 5, connect_timeout: 10, idle_timeout: 20 });
    globalForDb.__db = drizzle(client, { schema, casing: undefined });
  }
  return globalForDb.__db;
}

export { schema };
