/**
 * Fallback for files whose slicer we don't know (or that leave out grams or time):
 * walk the moves and add up the filament pushed and the time the moves take at their feed rates.
 * Handles absolute (M82/G90) and relative (M83/G91) extrusion and G92 resets.
 * The time ignores acceleration, so it usually comes out shorter than the real print.
 */
export type MotionTotals = { extrudedMm: number; seconds: number; moves: number; maxZ: number };

const SCAN_CHUNK = 1024 * 1024;
export const DEFAULT_ACCEL = 500; // mm/s²
export const DEFAULT_JUNCTION = 15; // mm/s: 99%, 101% and 90% of the slicer time on Joe's files

function moveSeconds(dist: number, v: number, a: number, vj: number): number {
  const v0 = Math.min(vj, v);
  const dAcc = (v * v - v0 * v0) / (2 * a);
  if (2 * dAcc <= dist) return (2 * (v - v0)) / a + (dist - 2 * dAcc) / v;
  const peak = Math.sqrt(v0 * v0 + a * dist);
  return (2 * (peak - v0)) / a;
}

/**
 * Each move is timed as a trapezoid: it starts and ends at the junction speed, speeds up and slows
 * down at `accel`. Defaults were calibrated on Joe's three real files (Ender-3 V3 SE); the file's
 * own M204 acceleration wins when it sets one.
 */
export function createMotionScanner(opts: { accel?: number; junction?: number } = {}) {
  let accel = opts.accel ?? DEFAULT_ACCEL;
  const junction = opts.junction ?? DEFAULT_JUNCTION;
  let absE = true;
  let absXYZ = true;
  let e = 0;
  let extruded = 0;
  let seconds = 0;
  let moves = 0;
  let feed = 1500; // mm/min, a common default until the file sets F
  let x = 0;
  let y = 0;
  let z = 0;
  let maxZ = 0;

  function line(raw: string) {
    const semi = raw.indexOf(";");
    const code = (semi === -1 ? raw : raw.slice(0, semi)).trim().toUpperCase();
    if (!code) return;
    const word = code.split(/\s+/, 1)[0]!;
    if (word === "M82") absE = true;
    else if (word === "M83") absE = false;
    else if (word === "G90" || word === "G91") {
      absXYZ = word === "G90";
      absE = absXYZ;
    } else if (word === "G92") {
      const m = code.match(/E(-?[\d.]+)/);
      if (m) e = Number(m[1]);
    } else if (word === "M204" || word === "M201") {
      const m = code.match(/[SP]([\d.]+)/);
      if (m && Number(m[1]) > 0 && word === "M204") accel = Number(m[1]);
    } else if (word === "G4") {
      const p = code.match(/P([\d.]+)/);
      const s = code.match(/S([\d.]+)/);
      seconds += p ? Number(p[1]) / 1000 : s ? Number(s[1]) : 0;
    } else if (word === "G0" || word === "G1" || word === "G2" || word === "G3") {
      let nx = x;
      let ny = y;
      let nz = z;
      for (const [, k, v] of code.matchAll(/([XYZEF])(-?[\d.]+)/g)) {
        const n = Number(v);
        if (!Number.isFinite(n)) continue;
        if (k === "X") nx = absXYZ ? n : x + n;
        else if (k === "Y") ny = absXYZ ? n : y + n;
        else if (k === "Z") nz = absXYZ ? n : z + n;
        else if (k === "F") feed = n > 0 ? n : feed;
        else if (k === "E") {
          const delta = absE ? n - e : n;
          extruded += delta;
          e = absE ? n : e + n;
        }
      }
      const dist = Math.hypot(nx - x, ny - y, nz - z);
      if (dist > 0) seconds += moveSeconds(dist, feed / 60, accel, junction);
      x = nx;
      y = ny;
      z = nz;
      if (z > maxZ && extruded > 0) maxZ = z;
      moves++;
    }
  }

  return {
    line,
    totals: (): MotionTotals => ({ extrudedMm: Math.max(0, extruded), seconds, moves, maxZ }),
  };
}

/** Reads the whole file in 1 MB slices; never holds it as one string. */
export async function scanMotion(file: Blob): Promise<MotionTotals> {
  const scanner = createMotionScanner();
  let carry = "";
  for (let start = 0; start < file.size; start += SCAN_CHUNK) {
    const text = carry + (await file.slice(start, Math.min(file.size, start + SCAN_CHUNK)).text());
    const lines = text.split("\n");
    carry = lines.pop() ?? "";
    for (const l of lines) scanner.line(l);
  }
  if (carry) scanner.line(carry);
  return scanner.totals();
}
