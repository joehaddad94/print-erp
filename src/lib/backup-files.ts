/**
 * The backup's file layout (M7, R8). Pure, so the server (weekly backup) and the browser
 * (Download full backup .zip) write exactly the same files.
 */
export const BACKUP_FORMAT = 1;

export type TableDump = { count: number; checksum: string; columns: string[]; rows: Record<string, unknown>[] };

export type Backup = {
  format: typeof BACKUP_FORMAT;
  createdAt: string;
  /** Latest applied migration, so a restore can tell which schema the rows belong to. */
  migration: string | null;
  tables: Record<string, TableDump>;
  files: { recipeId: number; name: string; fileName: string; url: string; sha256: string }[];
};

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(dump: TableDump): string {
  const cols = dump.rows[0] ? Object.keys(dump.rows[0]) : dump.columns;
  const lines = [cols.map(csvCell).join(",")];
  for (const r of dump.rows) lines.push(cols.map((c) => csvCell(r[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** The files written for one backup: a JSON dump, one CSV per table, and the manifest. */
export function backupFiles(b: Backup): { name: string; body: string; contentType: string }[] {
  const out = [{ name: "backup.json", body: JSON.stringify(b), contentType: "application/json" }];
  for (const [name, dump] of Object.entries(b.tables)) {
    out.push({ name: `${name}.csv`, body: toCsv(dump), contentType: "text/csv" });
  }
  const manifest = {
    createdAt: b.createdAt,
    migration: b.migration,
    tables: Object.fromEntries(Object.entries(b.tables).map(([k, v]) => [k, { count: v.count, checksum: v.checksum }])),
    files: b.files,
  };
  out.push({ name: "manifest.json", body: JSON.stringify(manifest, null, 2), contentType: "application/json" });
  return out;
}
