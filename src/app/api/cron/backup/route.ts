import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { db } from "@/db";
import { recordBackupRun } from "@/server/backup/status";
import { BackupRefused, storeBackup } from "@/server/backup/store";

export const maxDuration = 60;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Weekly backup (vercel.json cron). Vercel sends `Authorization: Bearer $CRON_SECRET`; anything else gets 401. */
export async function GET(req: Request) {
  await connection();
  if (!authorised(req)) return Response.json({ ok: false }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await storeBackup()) });
  } catch (e) {
    const message = e instanceof BackupRefused ? e.message : "Backup failed";
    console.error("backup failed", e);
    await recordBackupRun(db(), { ok: false, error: message }).catch(() => undefined);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
