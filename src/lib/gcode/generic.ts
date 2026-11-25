import { collectKeys, firstOf, num, plateObjects, thumbnails } from "./common";
import type { GcodeChunks, GcodeParser, ParsedGcode } from "./types";

/**
 * Any other slicer: reads whatever `; key = value` comments it can find (many slicers share
 * PrusaSlicer/Orca key names). Grams and time are filled in later from the moves (motion.ts)
 * and marked estimated. Always matches, so it must stay last in PARSERS.
 */
export const genericParser: GcodeParser = {
  id: "generic_gcode",
  version: "1",

  detect() {
    return true;
  },

  parse({ head, tail, objectLines }: GcodeChunks): ParsedGcode {
    const raw: Record<string, string> = {};
    collectKeys(head.slice(0, 16000), raw);
    collectKeys(tail, raw);
    const generated = head.match(/generated (?:by|with)\s+([A-Za-z][\w-]*)[^\d\n]*([\d.]+)?/i);
    return {
      parser: this.id,
      parserVersion: this.version,
      slicerName: generated?.[1] ?? null,
      slicerVersion: generated?.[2] ?? null,
      printerModel: raw["printer_model"] || null,
      nozzleMm: num(firstOf(raw["nozzle_diameter"])),
      material: firstOf(raw["filament_type"]) || null,
      colour: firstOf(raw["filament_colour"]) || null,
      layerHeightMm: num(raw["layer_height"]),
      totalLayers: null,
      totalGrams: num(raw["total filament used [g]"]) ?? num(firstOf(raw["filament used [g]"])),
      totalMm: num(firstOf(raw["filament used [mm]"])),
      totalCm3: num(firstOf(raw["filament used [cm3]"])),
      estimatedSeconds: null,
      nozzleTempC: num(firstOf(raw["temperature"] ?? raw["nozzle_temperature"])),
      bedTempC: num(firstOf(raw["bed_temperature"])),
      bedType: null,
      infillPct: null,
      infillPattern: null,
      wallLoops: null,
      supportType: null,
      supportsEnabled: null,
      slicerFilamentCost: null,
      objects: plateObjects(objectLines),
      thumbnails: thumbnails(head),
      rawHeader: raw,
      estimated: {},
    };
  },
};
