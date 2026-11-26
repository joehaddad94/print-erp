"use client";

import { useState } from "react";
import { GcodeFormatError, gramsMatch, parseGcodeFile, type ParsedGcode } from "@/lib/gcode";
import { findDuplicateAction } from "@/server/recipes/actions";
import type { ImportInput } from "@/server/recipes/schema";
import { sha256OfFile } from "./gcode-client";

export type ProductOption = { id: number; label: string };
export type ImportRow = {
  objectName: string | null;
  label: string;
  productId: string;
  newName: string;
  qty: string;
  grams: string;
};
export type Duplicate = { id: number; name: string; version: number };
/** The recipe a file becomes a new version of, with its items for pre-filling products. */
export type RecipeGroup = {
  recipeGroup: string;
  name: string;
  items: { objectName: string | null; productId: number }[];
};

export const num = (s: string) => Number(s.replace(/,/g, ""));
export const round = (n: number | null, dp = 3) => (n == null ? "" : Number(n.toFixed(dp)).toString());

/** Plate rows pre-filled from the file's object lines (D40.2); one object type → grams typed for you. */
function rowsFor(parsed: ParsedGcode, previous: RecipeGroup["items"]): ImportRow[] {
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
 * Reading a .gcode and filling in what a recipe needs (D14, D17), shared by Import and by
 * Start print's "From a .gcode file". The file is read in the browser; nothing is uploaded here.
 */
export function useGcodeImport({
  tolerance,
  initialGroup,
  onParsed,
}: {
  tolerance: { grams: number; pct: number };
  initialGroup?: RecipeGroup;
  /** Called after a new (not duplicate) file is read, e.g. to suggest a recipe to version. */
  onParsed?: (parsed: ParsedGcode) => RecipeGroup | undefined;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedGcode | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [group, setGroupState] = useState<RecipeGroup | undefined>(initialGroup);
  const [name, setName] = useState(initialGroup?.name ?? "");
  const [changeNote, setChangeNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [reading, setReading] = useState(false);
  // Values the file didn't state (worked out by the app): Joe confirms or types over them.
  const [totalGrams, setTotalGrams] = useState("");
  const [minutes, setMinutes] = useState("");

  const defaultName = (p: ParsedGcode, f: File) => p.objects[0]?.displayName ?? f.name.replace(/\.gcode$/i, "");

  async function choose(f: File | null) {
    setError(null);
    setDuplicate(null);
    setParsed(null);
    setFile(f);
    if (!f) return;
    setReading(true);
    try {
      const [p, sha] = await Promise.all([parseGcodeFile(f), sha256OfFile(f)]);
      if (p.totalGrams == null) throw new GcodeFormatError("The file has no total grams. Export it again.");
      const dup = await findDuplicateAction(sha);
      const g = initialGroup ?? (dup ? undefined : onParsed?.(p));
      setGroupState(g);
      setParsed(p);
      setTotalGrams(round(p.totalGrams, 2));
      setMinutes(p.estimatedSeconds != null ? String(Math.round(p.estimatedSeconds / 60)) : "");
      setRows(rowsFor(p, g?.items ?? []));
      if (g) setName(g.name);
      else if (!name || !initialGroup) setName(defaultName(p, f));
      setDuplicate(dup);
    } catch (e) {
      setError(e instanceof GcodeFormatError ? e.message : "This file couldn't be read as G-code.");
    } finally {
      setReading(false);
    }
  }

  /** Switch between "new recipe" and "new version of X"; fills products the rows don't have yet. */
  function setGroup(g: RecipeGroup | undefined) {
    setGroupState(g);
    if (g) {
      setName(g.name);
      setRows((rs) =>
        rs.map((r) => {
          if (r.productId) return r;
          const prev = g.items.find((p) => p.objectName && p.objectName === r.objectName);
          return prev ? { ...r, productId: String(prev.productId), newName: "" } : r;
        }),
      );
    } else if (parsed && file) setName(defaultName(parsed, file));
  }

  const update = (i: number, patch: Partial<ImportRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const gramsEstimated = !!parsed?.estimated.totalGrams;
  const timeEstimated = !!parsed?.estimated.estimatedSeconds;
  const plateGrams = gramsEstimated ? num(totalGrams) : (parsed?.totalGrams ?? NaN);
  const confirmedOk = (!gramsEstimated || num(totalGrams) > 0) && (!timeEstimated || num(minutes) > 0);

  /** Typing a new total moves a single item's grams with it, as on first read. */
  function changeTotal(v: string) {
    setTotalGrams(v);
    if (rows.length === 1 && num(v) > 0 && num(rows[0]!.qty) > 0)
      setRows([{ ...rows[0]!, grams: round(num(v) / num(rows[0]!.qty)) }]);
  }

  const filled = rows.every((r) => num(r.qty) > 0 && num(r.grams) > 0 && (r.productId || r.newName.trim()));
  const check =
    plateGrams > 0
      ? gramsMatch(
          rows.map((r) => ({ qty: num(r.qty) || 0, gramsPerPiece: num(r.grams) || 0 })),
          plateGrams,
          tolerance,
        )
      : null;
  /** A new file whose details are complete; a duplicate is never ready (it is used, not imported). */
  const ready = !!file && !!parsed && !duplicate && filled && !!check?.ok && confirmedOk && !!name.trim() && !reading;

  /** The import payload, once the file is uploaded and has a URL. */
  function payload(fileUrl: string): ImportInput {
    return {
      fileUrl,
      fileName: file!.name,
      name: name.trim(),
      recipeGroup: group?.recipeGroup ?? null,
      changeNote: changeNote.trim() || null,
      confirmed: {
        totalGrams: gramsEstimated ? num(totalGrams) : null,
        estimatedSeconds: timeEstimated ? num(minutes) * 60 : null,
      },
      items: rows.map((r) => ({
        productId: r.productId ? Number(r.productId) : null,
        newProductName: r.productId ? null : r.newName.trim(),
        newProductKind: "product",
        objectName: r.objectName,
        qty: num(r.qty),
        gramsPerPiece: num(r.grams),
      })),
    };
  }

  return {
    file,
    parsed,
    rows,
    update,
    group,
    setGroup,
    fixedGroup: !!initialGroup,
    name,
    setName,
    changeNote,
    setChangeNote,
    error,
    setError,
    duplicate,
    setDuplicate,
    reading,
    totalGrams,
    changeTotal,
    minutes,
    setMinutes,
    gramsEstimated,
    timeEstimated,
    plateGrams,
    check,
    ready,
    choose,
    payload,
  };
}

export type GcodeImport = ReturnType<typeof useGcodeImport>;
