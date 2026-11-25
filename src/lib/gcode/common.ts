import type { PlateObject, Thumbnail } from "./types";

/** Helpers shared by every slicer parser. */

export const num = (v: string | undefined): number | null => {
  if (v == null) return null;
  const n = Number.parseFloat(v.replace(/[%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export const firstOf = (v: string | undefined): string | undefined => v?.split(/[;,]/)[0]?.trim();

/** "1h 47m 30s" / "2d 3h 4m 5s" / "45m 2s" → seconds. */
export function durationToSeconds(text: string | undefined): number | null {
  if (!text) return null;
  let total = 0;
  let matched = false;
  for (const [, n, unit] of text.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])/g)) {
    matched = true;
    total += Number(n) * { d: 86400, h: 3600, m: 60, s: 1 }[unit as "d" | "h" | "m" | "s"];
  }
  return matched ? total : null;
}

/** Collects `; key = value` and `; key: value` comment lines. Later values do not overwrite earlier ones. */
export function collectKeys(text: string, into: Record<string, string>) {
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith(";")) continue;
    const body = line.replace(/^;\s?/, "");
    const m = body.match(/^([A-Za-z_][\w \[\]().-]*?)\s*(?:=|:)\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.trim();
    if (key.length > 80 || /^(png|plate_)/.test(key)) continue;
    if (!(key in into)) into[key] = m[2]!.trim().replace(/^"(.*)"$/, "$1");
  }
}

export function thumbnails(head: string): Thumbnail[] {
  const out: Thumbnail[] = [];
  // Creality/Orca: `; png begin W*H …`; PrusaSlicer: `; thumbnail begin WxH …` (PNG only; JPG/QOI are skipped).
  const re = /^; (png|thumbnail) begin (\d+)[*x](\d+)[^\n]*\n([\s\S]*?)^; \1 end/gm;
  for (const m of head.matchAll(re)) {
    const base64Png = m[4]!
      .split(/\r?\n/)
      .map((l) => l.replace(/^;\s?/, "").trim())
      .join("");
    if (base64Png) out.push({ width: Number(m[2]), height: Number(m[3]), base64Png });
  }
  return out.sort((a, b) => b.width * b.height - a.width * a.height);
}

const HASH_NAME = /^(?:.*\/)?[0-9a-f]{16,}\.(?:stl|3mf|obj|step)$/i;

export function plateObjects(objectLines: string[]): PlateObject[] {
  const ids = new Map<string, Set<string>>();
  for (const line of objectLines) {
    const m = line.match(/^; printing object (.+?) id:(\S+) copy (\d+)/);
    if (!m) continue;
    let name = m[1]!;
    try {
      name = decodeURIComponent(name);
    } catch {
      /* keep raw */
    }
    const key = `${m[2]}:${m[3]}`;
    if (!ids.has(name)) ids.set(name, new Set());
    ids.get(name)!.add(key);
  }
  let unnamed = 0;
  return [...ids.entries()].map(([rawName, set]) => {
    const base = rawName.split("/").pop()!;
    const displayName = HASH_NAME.test(rawName) ? `Object ${++unnamed}` : base.replace(/\.(stl|3mf|obj|step)$/i, "");
    return { rawName, displayName, count: set.size };
  });
}

/**
 * D16: does the printer named in the file match the machine? Slicers spell it differently
 * ("Creality Ender-3 V3 SE" in Creality Print, "ENDER3V3SE" in PrusaSlicer), so compare letters
 * and digits only, and accept either name containing the other.
 */
export function printerModelsMatch(fromFile: string, machine: string): boolean {
  const a = fromFile.toLowerCase().replace(/[^a-z0-9]/g, "");
  const b = machine.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!a || !b) return true;
  return a.includes(b) || b.includes(a);
}
