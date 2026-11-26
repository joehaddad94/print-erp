import "server-only";
import { db } from "@/db";
import { blobAccess, putFile, storageMode } from "@/server/storage";
import { backupFiles, createBackup } from "./index";
import { recordBackupRun } from "./status";

export class BackupRefused extends Error {}

/**
 * Takes a backup and writes it to private storage under backups/<timestamp>/.
 * Refuses a public Blob store: the dump holds every row, including password hashes.
 */
export async function storeBackup(now = new Date()) {
  if (storageMode() === "blob" && blobAccess() !== "private") {
    throw new BackupRefused("Backups need a private Blob store (BLOB_ACCESS=private).");
  }
  const backup = await createBackup(db(), now);
  const stamp = backup.createdAt.replace(/[:.]/g, "-");
  const written: string[] = [];
  for (const f of backupFiles(backup)) {
    written.push(await putFile(`backups/${stamp}/${f.name}`, new TextEncoder().encode(f.body), f.contentType));
  }
  await recordBackupRun(db(), { ok: true, files: written.length });
  return {
    createdAt: backup.createdAt,
    files: written.length,
    tables: Object.fromEntries(Object.entries(backup.tables).map(([k, v]) => [k, v.count])),
  };
}
