import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";

/** Smoke test target (K-S1): 200 when the database answers, 503 with an error code otherwise. Reveals nothing else. */
export async function GET() {
  await connection();
  try {
    await db().execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (e) {
    // Only the error code (e.g. 28P01 wrong password, ENOTFOUND bad host): never the URL or message.
    const c = (e as { code?: unknown; cause?: { code?: unknown } })?.cause?.code ?? (e as { code?: unknown })?.code;
    const code = typeof c === "string" && /^[A-Z0-9_]{2,30}$/.test(c) ? c : "UNKNOWN";
    return Response.json({ ok: false, code }, { status: 503 });
  }
}
