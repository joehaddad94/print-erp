import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "@/db/schema";

/** Server used for throwaway databases. Never point this at Supabase. */
export const ADMIN_URL = process.env.TEST_PG_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";

export function urlFor(dbName: string) {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${dbName}`;
  return u.toString();
}

/** Drops (if present) and creates an empty database, then applies every migration. */
export async function freshDatabase(dbName: string) {
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error("bad db name");
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists ${dbName} with (force)`);
  await admin.unsafe(`create database ${dbName}`);
  await admin.end();
  const client = postgres(urlFor(dbName), { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
  return urlFor(dbName);
}

export function connect(url: string) {
  const client = postgres(url, { max: 4, prepare: false, onnotice: () => {} });
  return { client, db: drizzle(client, { schema }) };
}
