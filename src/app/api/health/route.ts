import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";

/** Smoke test target (K-S1): 200 when the database answers, 503 otherwise. Reveals nothing else. */
export async function GET() {
  await connection();
  try {
    await db().execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
