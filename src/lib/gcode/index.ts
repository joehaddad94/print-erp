import { bambuStudioParser, crealityPrintParser, orcaSlicerParser } from "./creality-print";
import { DEFAULT_DIAMETER_MM, densityFor, firstOf, gramsFromMm, num } from "./common";
import { curaParser } from "./cura";
import { genericParser } from "./generic";
import { scanMotion, type MotionTotals } from "./motion";
import { prusaSlicerParser } from "./prusaslicer";
import { simplify3dParser } from "./simplify3d";
import { GcodeFormatError, type GcodeChunks, type GcodeParser, type ParsedGcode } from "./types";

export * from "./types";
export { densityFor, durationToSeconds, gramsFromMm, plateObjects, printerModelsMatch } from "./common";
export { createMotionScanner, scanMotion } from "./motion";

/**
 * One parser per slicer format (D14). Add new formats here; no schema change needed.
 * PrusaSlicer goes first: its config can name a "Creality …" printer profile.
 * The generic parser matches anything, so it is last: values it can't read come from the moves.
 */
export const PARSERS: readonly GcodeParser[] = [
  prusaSlicerParser,
  crealityPrintParser,
  orcaSlicerParser,
  bambuStudioParser,
  curaParser,
  simplify3dParser,
  genericParser,
];

/** Slicers whose files are read exactly. Any other slicer's file still works, with estimates. */
export const SUPPORTED_SLICERS =
  "Creality Print, PrusaSlicer, OrcaSlicer, Bambu Studio, Cura, SuperSlicer or Simplify3D";

/** Bytes read from each end (D40.1): header + thumbnails at the start, totals + config at the end. */
export const HEAD_BYTES = 64 * 1024;
export const TAIL_BYTES = 96 * 1024;
const SCAN_CHUNK = 1024 * 1024;
const OBJECT_MARKER = "; printing object ";

/** Pure: parse already-read chunks. Throws GcodeFormatError for files no parser recognises. */
export function parseGcodeChunks(chunks: GcodeChunks): ParsedGcode {
  if (!chunks.head.trim()) throw new GcodeFormatError("The file is empty.");
  // PrusaSlicer's binary G-code starts with the magic bytes "GCDE".
  if (chunks.head.startsWith("GCDE")) {
    throw new GcodeFormatError(
      "This is binary G-code (.bgcode). In PrusaSlicer turn off Printer Settings › General › Binary G-code, then export again.",
    );
  }
  const parser = PARSERS.find((p) => p.detect(chunks.head, chunks.tail))!;
  return parser.parse(chunks);
}

/**
 * Reads a .gcode file in the browser (File) or on the server (Blob from fetch/fs).
 * Never holds the whole file as one string: the middle is scanned in 1 MB slices
 * for object lines only (they are spread through the moves, D40.2).
 */
export async function readGcodeChunks(file: Blob): Promise<GcodeChunks> {
  const size = file.size;
  const head = await file.slice(0, Math.min(HEAD_BYTES, size)).text();
  const tail = await file.slice(Math.max(0, size - TAIL_BYTES), size).text();
  const seen = new Set<string>();
  const objectLines: string[] = [];
  let carry = "";
  for (let start = 0; start < size; start += SCAN_CHUNK) {
    const text = carry + (await file.slice(start, Math.min(size, start + SCAN_CHUNK)).text());
    const lastNewline = text.lastIndexOf("\n");
    const complete = lastNewline === -1 ? "" : text.slice(0, lastNewline);
    carry = lastNewline === -1 ? text : text.slice(lastNewline + 1);
    let i = complete.indexOf(OBJECT_MARKER);
    while (i !== -1) {
      if (i === 0 || complete[i - 1] === "\n") {
        const end = complete.indexOf("\n", i);
        const line = complete.slice(i, end === -1 ? undefined : end).trimEnd();
        if (!seen.has(line)) {
          seen.add(line);
          objectLines.push(line);
        }
      }
      i = complete.indexOf(OBJECT_MARKER, i + OBJECT_MARKER.length);
    }
  }
  if (carry.startsWith(OBJECT_MARKER) && !seen.has(carry.trimEnd())) objectLines.push(carry.trimEnd());
  return { head, tail, objectLines };
}

/**
 * Reads any .gcode. When the file doesn't state the grams or the time, they are worked out
 * from the moves and listed in `estimated`, so the screens can ask Joe to confirm them.
 */
export async function parseGcodeFile(file: Blob): Promise<ParsedGcode> {
  const parsed = parseGcodeChunks(await readGcodeChunks(file));
  if (parsed.totalGrams != null && parsed.estimatedSeconds != null) return parsed;
  const motion = await scanMotion(file);
  if (parsed.parser === "generic_gcode" && motion.extrudedMm <= 0)
    throw new GcodeFormatError(
      `This doesn't look like a G-code print file: it has no extrusion moves. Export plain .gcode from your slicer (for example ${SUPPORTED_SLICERS}).`,
    );
  return fillFromMotion(parsed, motion);
}

/** Pure: fills missing grams/time from move totals and says how each was worked out. */
export function fillFromMotion(parsed: ParsedGcode, motion: MotionTotals): ParsedGcode {
  const out: ParsedGcode = { ...parsed, estimated: { ...parsed.estimated } };
  if (out.totalGrams == null && motion.extrudedMm > 0) {
    const mm = out.totalMm ?? Number(motion.extrudedMm.toFixed(2));
    const diameter = num(firstOf(out.rawHeader["filament_diameter"])) ?? DEFAULT_DIAMETER_MM;
    const fromFile = num(firstOf(out.rawHeader["filament_density"]));
    const { density, known } = fromFile != null ? { density: fromFile, known: true } : densityFor(out.material);
    out.totalMm = mm;
    out.totalGrams = gramsFromMm(mm, diameter, density);
    out.estimated.totalGrams =
      `Worked out from the ${Number((mm / 1000).toFixed(2))} m of filament the moves push, ` +
      `for ${diameter} mm filament at ${density} g/cm³` +
      (known ? (out.material ? ` (${out.material}).` : ".") : " (PLA assumed: the file doesn't name the material).");
  }
  if (out.estimatedSeconds == null && motion.seconds > 0) {
    out.estimatedSeconds = Math.round(motion.seconds);
    out.estimated.estimatedSeconds =
      "Worked out from the moves at their set speeds. Real prints usually take longer (the printer slows for corners).";
  }
  return out;
}

/** D17: the plate items' grams must match the file's total within max(2 g, 2%). */
export function gramsMatch(
  items: { qty: number; gramsPerPiece: number }[],
  totalGrams: number,
  tolerance = { grams: 2, pct: 2 },
): { ok: boolean; sum: number; gap: number; allowed: number } {
  const sum = items.reduce((s, i) => s + i.qty * i.gramsPerPiece, 0);
  const allowed = Math.max(tolerance.grams, (totalGrams * tolerance.pct) / 100);
  const gap = sum - totalGrams;
  return { ok: Math.abs(gap) <= allowed + 1e-9, sum, gap, allowed };
}
