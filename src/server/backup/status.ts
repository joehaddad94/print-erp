import { desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import { backupRuns } from "@/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

/** A backup older than this turns red on Settings (it runs weekly, so one missed run). */
export const BACKUP_LATE_DAYS = 8;

export async function recordBackupRun(db: Db, r: { ok: boolean; files?: number; error?: string | null }) {
  await db.insert(backupRuns).values({ ok: r.ok, files: r.files ?? 0, error: r.error ?? null });
}

/** The cron runs Mondays 02:00 UTC (vercel.json), 04:00 or 05:00 in Beirut. */
export function nextBackupAt(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2));
  const ahead = (1 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + ahead);
  if (d <= now) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

/** R8 Settings → Backup: the last good run, whether the latest one failed, and whether it is late. */
export async function backupStatus(db: Db, now = new Date()) {
  const [latest] = await db.select().from(backupRuns).orderBy(desc(backupRuns.createdAt), desc(backupRuns.id)).limit(1);
  const [lastOk] = await db
    .select()
    .from(backupRuns)
    .where(eq(backupRuns.ok, true))
    .orderBy(desc(backupRuns.createdAt), desc(backupRuns.id))
    .limit(1);
  const late = !lastOk || now.getTime() - lastOk.createdAt.getTime() > BACKUP_LATE_DAYS * 86_400_000;
  return {
    lastOkAt: lastOk?.createdAt ?? null,
    lastFailed: latest && !latest.ok ? { at: latest.createdAt, error: latest.error } : null,
    late,
    next: nextBackupAt(now),
  };
}
