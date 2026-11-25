import { crealityPrintParser } from "./creality-print";
import { GcodeFormatError, type GcodeChunks, type GcodeParser, type ParsedGcode } from "./types";

export * from "./types";
export { durationToSeconds, plateObjects } from "./creality-print";

/** One parser per slicer format (D14). Add new formats here; no schema change needed. */
export const PARSERS: readonly GcodeParser[] = [crealityPrintParser];

/** Bytes read from each end (D40.1): header + thumbnails at the start, totals + config at the end. */
export const HEAD_BYTES = 64 * 1024;
export const TAIL_BYTES = 96 * 1024;
const SCAN_CHUNK = 1024 * 1024;
const OBJECT_MARKER = "; printing object ";

/** Pure: parse already-read chunks. Throws GcodeFormatError for files no parser recognises. */
export function parseGcodeChunks(chunks: GcodeChunks): ParsedGcode {
  if (!chunks.head.trim()) throw new GcodeFormatError("The file is empty.");
  const parser = PARSERS.find((p) => p.detect(chunks.head, chunks.tail));
  if (!parser) {
    throw new GcodeFormatError(
      "This isn't a Creality Print .gcode file. Export plain .gcode from Creality Print and try again.",
    );
  }
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

export async function parseGcodeFile(file: Blob): Promise<ParsedGcode> {
  return parseGcodeChunks(await readGcodeChunks(file));
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
