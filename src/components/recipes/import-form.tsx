"use client";

import { Link } from "@/components/ui/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button, Callout, Card, Field, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { GcodeFormatError, gramsMatch, parseGcodeFile, SUPPORTED_SLICERS, type ParsedGcode } from "@/lib/gcode";
import { findDuplicateAction, importRecipeAction } from "@/server/recipes/actions";
import type { StorageMode } from "@/server/storage";
import { formatDuration } from "@/lib/format";
import { sha256OfFile, takeHandedOffFile, uploadGcode } from "./gcode-client";

type ProductOption = { id: number; label: string };
type Row = { objectName: string | null; label: string; productId: string; newName: string; qty: string; grams: string };
type Duplicate = { id: number; name: string; version: number };

const num = (s: string) => Number(s.replace(/,/g, ""));
const round = (n: number, dp = 3) => Number(n.toFixed(dp)).toString();

/** Plate rows pre-filled from the file's object lines (D40.2); one object type → grams typed for you. */
function rowsFor(parsed: ParsedGcode, previous: { objectName: string | null; productId: number }[]): Row[] {
  const total = parsed.totalGrams ?? 0;
  const objects = parsed.objects.length ? parsed.objects : [{ rawName: "", displayName: "Item", count: 1 }];
  return objects.map((o) => {
    const prev = previous.find((p) => p.objectName && p.objectName === o.rawName);
    return {
      objectName: o.rawName || null,
      label: o.displayName,
      productId: prev ? String(prev.productId) : "",
      newName: prev ? "" : o.displayName,
      qty: String(o.count),
      grams: objects.length === 1 && total > 0 ? round(total / o.count) : "",
    };
  });
}

/**
 * Import a .gcode as a recipe or a new version of one (D14, D17). The file is read in the
 * browser first, so Joe sees the specs and items before anything is uploaded.
 */
export function ImportForm({
  mode,
  access,
  products,
  tolerance,
  group,
}: {
  mode: StorageMode;
  access: "private" | "public";
  products: ProductOption[];
  tolerance: { grams: number; pct: number };
  group?: { recipeGroup: string; name: string; items: { objectName: string | null; productId: number }[] };
}) {
  const router = useRouter();
  const fileId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedGcode | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState(group?.name ?? "");
  const [changeNote, setChangeNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [busy, setBusy] = useState<null | "reading" | "uploading" | "saving">(null);

  async function choose(f: File | null) {
    setError(null);
    setDuplicate(null);
    setParsed(null);
    setFile(f);
    if (!f) return;
    setBusy("reading");
    try {
      const [p, sha] = await Promise.all([parseGcodeFile(f), sha256OfFile(f)]);
      if (p.totalGrams == null) throw new GcodeFormatError("The file has no total grams. Export it again.");
      setParsed(p);
      setRows(rowsFor(p, group?.items ?? []));
      if (!group && !name) setName(p.objects[0]?.displayName ?? f.name.replace(/\.gcode$/i, ""));
      setDuplicate(await findDuplicateAction(sha));
    } catch (e) {
      setError(e instanceof GcodeFormatError ? e.message : "This file couldn't be read as G-code.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    // Runs once on mount: picks up a file handed over by the cost calculator (an external store),
    // read asynchronously like any other file.
    // Also picks up a file chosen before the page finished loading (slow phones).
    const handed = takeHandedOffFile() ?? fileInput.current?.files?.[0];
    if (handed) void Promise.resolve(handed).then(choose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const filled = rows.every((r) => num(r.qty) > 0 && num(r.grams) > 0 && (r.productId || r.newName.trim()));
  const check =
    parsed?.totalGrams != null
      ? gramsMatch(
          rows.map((r) => ({ qty: num(r.qty) || 0, gramsPerPiece: num(r.grams) || 0 })),
          parsed.totalGrams,
          tolerance,
        )
      : null;
  const canSave = !!file && !!parsed && !duplicate && filled && !!check?.ok && !!name.trim() && !busy;

  async function save() {
    if (!file || !parsed || !canSave) return;
    setError(null);
    try {
      setBusy("uploading");
      const fileUrl = await uploadGcode(file, mode, access);
      setBusy("saving");
      const res = await importRecipeAction({
        fileUrl,
        fileName: file.name,
        name: name.trim(),
        recipeGroup: group?.recipeGroup ?? null,
        changeNote: changeNote.trim() || null,
        items: rows.map((r) => ({
          productId: r.productId ? Number(r.productId) : null,
          newProductName: r.productId ? null : r.newName.trim(),
          newProductKind: "product",
          objectName: r.objectName,
          qty: num(r.qty),
          gramsPerPiece: num(r.grams),
        })),
      });
      if (res.saved) {
        router.push(`/recipes/${res.saved.id}`);
        return;
      }
      setDuplicate(res.duplicateOf ?? null);
      setError(res.error ?? "Couldn't save.");
    } catch {
      setError("The upload failed. Nothing was saved. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <Field id={fileId} label="G-code file" hint={`Plain .gcode exported from ${SUPPORTED_SLICERS}.`}>
          <input
            ref={fileInput}
            id={fileId}
            type="file"
            accept=".gcode"
            onChange={(e) => void choose(e.target.files?.[0] ?? null)}
            className="control px-3 py-2.5 text-sm text-ink"
          />
        </Field>
        {busy === "reading" ? <p className="text-sm text-ink-muted">Reading the file…</p> : null}
        {error ? <Callout tone="danger">{error}</Callout> : null}
        {duplicate ? (
          <Callout tone="warning" title="Same file">
            This file is already{" "}
            <Link
              className="inline-flex min-h-tap items-center font-semibold underline"
              href={`/recipes/${duplicate.id}`}
            >
              {duplicate.name} v{duplicate.version}
            </Link>
            . Nothing to import.
          </Callout>
        ) : null}
      </Card>

      {parsed ? (
        <>
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">From the file</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Spec label="Filament">{round(parsed.totalGrams ?? 0, 2)} g</Spec>
              <Spec label="Estimated time">{formatDuration(parsed.estimatedSeconds)}</Spec>
              <Spec label="Material">{parsed.material ?? "—"}</Spec>
              <Spec label="Printer">{parsed.printerModel ?? "—"}</Spec>
              <Spec label="Nozzle">{parsed.nozzleMm != null ? `${parsed.nozzleMm} mm` : "—"}</Spec>
              <Spec label="Layer height">{parsed.layerHeightMm != null ? `${parsed.layerHeightMm} mm` : "—"}</Spec>
            </dl>
          </Card>

          <Card className="flex flex-col gap-4">
            <Field id={`${fileId}-recipe-name`} label="Recipe name">
              <Input
                id={`${fileId}-recipe-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!!group}
              />
            </Field>
            {group ? (
              <Field id={`${fileId}-change-note`} label="What changed" hint="Saved with this version.">
                <Input
                  id={`${fileId}-change-note`}
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                />
              </Field>
            ) : null}
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="text-lg font-bold">Items on the plate</h2>
            {rows.map((r, i) => (
              <fieldset key={i} className="flex flex-col gap-3 rounded-md border border-border p-3">
                <legend className="px-1 text-sm font-semibold">{r.label}</legend>
                <Field id={`${fileId}-item-${i}-product`} label="Product or part">
                  <select
                    id={`${fileId}-item-${i}-product`}
                    value={r.productId}
                    onChange={(e) => update(i, { productId: e.target.value })}
                    className="control px-3 text-md text-ink"
                  >
                    <option value="">New product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {r.productId ? null : (
                  <Field id={`${fileId}-item-${i}-new`} label="New product name">
                    <Input
                      id={`${fileId}-item-${i}-new`}
                      value={r.newName}
                      onChange={(e) => update(i, { newName: e.target.value })}
                    />
                  </Field>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field id={`${fileId}-item-${i}-qty`} label="Pieces on plate">
                    <Input
                      id={`${fileId}-item-${i}-qty`}
                      inputMode="numeric"
                      value={r.qty}
                      onChange={(e) => update(i, { qty: e.target.value })}
                    />
                  </Field>
                  <Field id={`${fileId}-item-${i}-grams`} label="Grams per piece">
                    <Input
                      id={`${fileId}-item-${i}-grams`}
                      inputMode="decimal"
                      value={r.grams}
                      onChange={(e) => update(i, { grams: e.target.value })}
                    />
                  </Field>
                </div>
              </fieldset>
            ))}
            {check ? (
              <p
                role="status"
                className={cn("text-sm font-semibold", check.ok ? "text-success" : "text-danger")}
                data-testid="grams-check"
              >
                {check.ok
                  ? `Items add up to ${round(check.sum, 2)} g of ${round(parsed.totalGrams ?? 0, 2)} g.`
                  : `Items add up to ${round(check.sum, 2)} g but the file uses ${round(parsed.totalGrams ?? 0, 2)} g: ` +
                    `${check.gap > 0 ? "+" : ""}${round(check.gap, 2)} g (allowed ±${round(check.allowed, 2)} g).`}
              </p>
            ) : null}
          </Card>

          <Button block disabled={!canSave} onClick={() => void save()}>
            {busy === "uploading"
              ? "Uploading…"
              : busy === "saving"
                ? "Saving…"
                : group
                  ? "Save new version"
                  : "Save recipe"}
          </Button>
        </>
      ) : null}
    </div>
  );
}

function Spec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}
