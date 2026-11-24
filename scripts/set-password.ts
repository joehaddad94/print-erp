/**
 * D42 password reset (no email): pnpm user:set-password <username>
 * Reads the new password from the NEW_PASSWORD env var so it never lands in shell history.
 * Changing the password signs out every existing session.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { setPassword } from "../src/server/auth/service";

async function main() {
  const username = process.argv[2];
  const password = process.env.NEW_PASSWORD;
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!username || !password || !url) {
    throw new Error("Usage: NEW_PASSWORD=… DIRECT_URL=… pnpm user:set-password <username>");
  }
  if (password.length < 10) throw new Error("Password must be at least 10 characters");
  const client = postgres(url, { prepare: false, max: 1 });
  try {
    await setPassword(drizzle(client, { schema }), username, password);
    console.log(`Password set for "${username}". Other sessions are signed out.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
