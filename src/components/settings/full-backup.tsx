"use client";

import { zip, type Zippable } from "fflate";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { backupFiles, type Backup } from "@/lib/backup-files";

const enc = new TextEncoder();
const hex = async (b: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file.gcode";

/**
 * R8 Download full backup: one .zip built in the browser (so no server limit on its size):
 * every table as JSON and CSV, every G-code file, and checksums.txt with a SHA-256 per file.
 */
export function FullBackupButton() {
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run() {
    setError(null);
    setDone(null);
    try {
      setStep("Reading every table…");
      const res = await fetch("/api/backup", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const backup = (await res.json()) as Backup;
      const files: Record<string, Uint8Array> = {};
      for (const f of backupFiles(backup)) files[`data/${f.name}`] = enc.encode(f.body);
      const gcode = backup.files.filter((f) => f.url);
      const missing: string[] = [];
      for (const [i, f] of gcode.entries()) {
        setStep(`G-code file ${i + 1} of ${gcode.length}…`);
        const r = await fetch(`/api/backup/files/${f.recipeId}`, { cache: "no-store" });
        if (!r.ok) {
          missing.push(`${f.recipeId} ${f.fileName}`);
          continue;
        }
        files[`gcode/${f.recipeId}-${safe(f.fileName)}`] = new Uint8Array(await r.arrayBuffer());
      }
      setStep("Writing checksums…");
      const lines: string[] = [];
      for (const [name, bytes] of Object.entries(files)) lines.push(`${await hex(bytes)}  ${name}`);
      if (missing.length) lines.push("", "Missing from storage:", ...missing);
      files["checksums.txt"] = enc.encode(lines.join("\n") + "\n");
      setStep("Zipping…");
      const zipped = await new Promise<Uint8Array>((ok, fail) =>
        zip(files as Zippable, { level: 6 }, (e, out) => (e ? fail(e) : ok(out))),
      );
      const url = URL.createObjectURL(new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `print-erp-backup-${backup.createdAt.slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDone(`Saved: ${Object.keys(files).length} files, ${gcode.length - missing.length} of them G-code.`);
      if (missing.length)
        setError(`${missing.length} G-code file(s) were missing from storage. They are listed in checksums.txt.`);
    } catch {
      setError("The backup couldn't be built. Check your connection and try again.");
    } finally {
      setStep(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button variant="secondary" onClick={run} pending={step != null}>
        Download full backup
      </Button>
      <p role="status" className="text-xs text-ink-muted">
        {step ?? done}
      </p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
