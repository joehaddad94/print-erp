import { describe, expect, it } from "vitest";
import { backupRuns } from "@/db/schema";
import { backupStatus, nextBackupAt, recordBackupRun } from "@/server/backup/status";
import { setupTestDb } from "./helpers";

const { db } = setupTestDb();
const day = 86_400_000;

describe("R8 backup status", () => {
  it("next run is the coming Monday 02:00 UTC, a week later when it just passed", () => {
    expect(nextBackupAt(new Date("2026-11-26T10:00:00Z")).toISOString()).toBe("2026-11-30T02:00:00.000Z");
    expect(nextBackupAt(new Date("2026-11-30T01:59:00Z")).toISOString()).toBe("2026-11-30T02:00:00.000Z");
    expect(nextBackupAt(new Date("2026-11-30T02:00:00Z")).toISOString()).toBe("2026-12-07T02:00:00.000Z");
  });

  it("no backup yet is late; a recent good one is OK; older than 8 days is late again", async () => {
    expect(await backupStatus(db)).toMatchObject({ lastOkAt: null, late: true, lastFailed: null });
    await recordBackupRun(db, { ok: true, files: 30 });
    const now = new Date();
    expect(await backupStatus(db, now)).toMatchObject({ late: false, lastFailed: null });
    expect((await backupStatus(db, new Date(now.getTime() + 9 * day))).late).toBe(true);
  });

  it("a failed latest run is shown with its reason, while the last good one is kept", async () => {
    await db.insert(backupRuns).values({ ok: true, files: 30, createdAt: new Date(Date.now() - 2 * day) });
    await recordBackupRun(db, { ok: false, error: "Backups need a private Blob store" });
    const s = await backupStatus(db);
    expect(s.lastFailed?.error).toBe("Backups need a private Blob store");
    expect(s.lastOkAt).not.toBeNull();
    expect(s.late).toBe(false);
  });
});
