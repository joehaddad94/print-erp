import { DEFAULT_DIAMETER_MM, densityFor, firstOf, gramsFromMm, num } from "./common";
import type { GcodeChunks, GcodeParser, ParsedGcode } from "./types";

/**
 * Ultimaker Cura 4.x/5.x .gcode (Marlin flavour). Cura writes:
 * - `;FLAVOR:`, `;TIME:<s>`, `;Filament used: 1.23456m` (one value per extruder), `;Layer height:`,
 *   `;Generated with Cura_SteamEngine 5.x` and `;LAYER_COUNT:` at the top;
 * - only the CHANGED settings, as an escaped profile split over `;SETTING_3 ` lines at the end.
 * It never writes grams or the material name, so grams are worked out from the length
 * (1.75 mm unless the profile says otherwise, density by material, PLA if unknown) and marked estimated.
 */
export const curaParser: GcodeParser = {
  id: "cura_gcode",
  version: "1",

  detect(head) {
    return /^;\s*Generated with Cura/im.test(head) || (/^;FLAVOR:/m.test(head) && /^;TIME:\d/m.test(head));
  },

  parse({ head, tail }: GcodeChunks): ParsedGcode {
    const raw: Record<string, string> = {};
    for (const [, k, v] of head.slice(0, 8000).matchAll(/^;([A-Za-z_][\w .]*?):\s*(.*)$/gm)) {
      if (!(k! in raw)) raw[k!] = v!.trim();
    }
    // Profile: ;SETTING_3 lines joined, "\\n" unescaped, then `key = value` pairs.
    const profile = [...tail.matchAll(/^;SETTING_3 (.*)$/gm)].map((m) => m[1]).join("");
    for (const [, k, v] of profile.replace(/\\+n/g, "\n").matchAll(/^([a-z_][a-z0-9_]*) = (.*)$/gm)) {
      raw[k!] = v!.trim();
    }

    const generated = head.match(/Generated with Cura\S*\s+([\d.]+)/i);
    const metres = num(firstOf(raw["Filament used"])?.replace(/m$/, ""));
    const totalMm = metres == null ? null : Number((metres * 1000).toFixed(2));
    const material = raw["material_type"] ?? null;
    const diameter = num(raw["material_diameter"]) ?? DEFAULT_DIAMETER_MM;
    const { density, known } = densityFor(material);
    const supportsEnabled = raw["support_enable"] == null ? null : raw["support_enable"] === "True";

    return {
      parser: this.id,
      parserVersion: this.version,
      slicerName: "Cura",
      slicerVersion: generated?.[1] ?? null,
      printerModel: raw["TARGET_MACHINE.NAME"] ?? null,
      nozzleMm: num(raw["machine_nozzle_size"]),
      material,
      colour: null,
      layerHeightMm: num(raw["Layer height"]) ?? num(raw["layer_height"]),
      totalLayers: num(raw["LAYER_COUNT"]),
      totalGrams: totalMm == null ? null : gramsFromMm(totalMm, diameter, density),
      totalMm,
      totalCm3: null,
      estimatedSeconds: num(raw["TIME"]),
      nozzleTempC: num(raw["material_print_temperature"]),
      bedTempC: num(raw["material_bed_temperature"]),
      bedType: null,
      infillPct: num(raw["infill_sparse_density"]),
      infillPattern: raw["infill_pattern"] ?? null,
      wallLoops: num(raw["wall_line_count"]),
      supportType: supportsEnabled === false ? "none" : (raw["support_structure"] ?? null),
      supportsEnabled,
      slicerFilamentCost: null,
      objects: [],
      thumbnails: [],
      rawHeader: raw,
      estimated:
        totalMm == null
          ? {}
          : {
              totalGrams:
                `Cura gives the length (${Number((totalMm / 1000).toFixed(2))} m), not grams. ` +
                `Worked out for ${diameter} mm filament at ${density} g/cm³` +
                (known ? ` (${material}).` : " (PLA assumed: the file doesn't name the material)."),
            },
    };
  },
};
