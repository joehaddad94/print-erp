import { rmSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import { setPassword } from "@/server/auth/service";
import { E2E_DB, E2E_UPLOAD_DIR, E2E_USER } from "../../playwright.config";
import { freshDatabase } from "../support/pg";

/** Fresh migrated + seeded database with one user, before the server starts serving tests. */
export default async function setup() {
  rmSync(E2E_UPLOAD_DIR, { recursive: true, force: true });
  const url = await freshDatabase(E2E_DB);
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });
  await seed(db);
  await setPassword(db, E2E_USER.username, E2E_USER.password);
  await client.end();
}
