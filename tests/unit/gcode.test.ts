import { describe, expect, it } from "vitest";
import {
  durationToSeconds,
  gramsMatch,
  parseGcodeChunks,
  parseGcodeFile,
  printerModelsMatch,
  readGcodeChunks,
} from "@/lib/gcode";
import { fixtureBlob, haveFixture, haveFixtures } from "../support/fixtures";
import { syntheticGcode, syntheticPrusaGcode } from "../support/synthetic-gcode";

function pngSize(base64: string) {
  const b = Buffer.from(base64, "base64");
  expect(b.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

describe.skipIf(!haveFixtures)("Joe's real files (fixtures present locally)", () => {
  it("P-01..P-05, P-08..P-10 padel holder", async () => {
    const g = await parseGcodeFile(fixtureBlob("padel"));
    expect(g).toMatchObject({
      parser: "creality_print_gcode",
      slicerName: "Creality_Print",
      slicerVersion: "7.3.2.6412",
      printerModel: "Creality Ender-3 V3 SE",
      nozzleMm: 0.4,
      material: "PLA",
      colour: "#00FF80",
      layerHeightMm: 0.2,
      totalLayers: 180,
      totalGrams: 29.22,
      totalMm: 9797.72, // P-03: end-of-file mm wins over header 9.76652 m
      totalCm3: 23.57,
      estimatedSeconds: 6450.35,
      nozzleTempC: 190,
      bedTempC: 50,
      bedType: "High Temp Plate",
      infillPct: 15,
      infillPattern: "zig-zag",
      wallLoops: 2,
      supportType: "tree(auto)",
      supportsEnabled: true,
    });
    expect(durationToSeconds(g.rawHeader["estimated printing time (normal mode)"])).toBe(6450); // P-02
    expect(g.objects).toEqual([
      { rawName: expect.stringMatching(/^model\/ab6025f1.*\.stl$/), displayName: "Object 1", count: 1 },
    ]); // P-05
    expect(g.thumbnails[0]).toMatchObject({ width: 300, height: 300 }); // P-08
    expect(pngSize(g.thumbnails[0]!.base64Png)).toEqual({ width: 300, height: 300 });
    expect(g.rawHeader["filament_cost"]).toBe("30"); // P-09: read, never used in cost
    expect(g.rawHeader["printer_settings_id"]).toBe("Creality Ender-3 V3 SE 0.4 nozzle"); // P-10
    expect(Object.keys(g.rawHeader).length).toBeGreaterThan(200);
  });

  it("P-06/P-07 croix: one item × 4, 2.1175 g each, supports none", async () => {
    const g = await parseGcodeFile(fixtureBlob("croix"));
    expect(g).toMatchObject({
      totalGrams: 8.47,
      totalMm: 2839.67,
      totalCm3: 6.83,
      estimatedSeconds: 4094.37,
      totalLayers: 13,
      colour: "#FFFFFF",
      supportType: "none",
    });
    expect(g.objects).toEqual([{ rawName: "new croix.stl", displayName: "new croix", count: 4 }]);
    expect(g.totalGrams! / g.objects[0]!.count).toBeCloseTo(2.1175, 9);
    expect(pngSize(g.thumbnails[0]!.base64Png)).toEqual({ width: 300, height: 300 });
  });

  it("P-11 browser and server read paths agree (same function, Blob input)", async () => {
    const blob = fixtureBlob("croix");
    const viaFile = await parseGcodeFile(new File([blob], "x.gcode"));
    expect(viaFile).toEqual(await parseGcodeFile(blob));
  });

  it("P-13 the 6.3 MB croix file parses in under 1.5 s", async () => {
    const blob = fixtureBlob("croix");
    const t = performance.now();
    await parseGcodeFile(blob);
    expect(performance.now() - t).toBeLessThan(1500);
  });
});

describe("synthetic files (always run)", () => {
  it("counts distinct ids per object across layers and keeps plain names", async () => {
    const text = syntheticGcode({
      objects: [
        { name: "stand base.stl", ids: ["0", "1"] },
        { name: "clip.stl", ids: ["7"] },
      ],
      totalGrams: 25,
      filler: 50_000, // ~1 MB+, crosses the 1 MB scan slices
    });
    const g = await parseGcodeFile(new Blob([text]));
    expect(g.objects).toEqual([
      { rawName: "stand base.stl", displayName: "stand base", count: 2 },
      { rawName: "clip.stl", displayName: "clip", count: 1 },
    ]);
    expect(g.totalGrams).toBe(25);
    expect(g.estimatedSeconds).toBe(3600);
    expect(pngSize(g.thumbnails[0]!.base64Png)).toEqual({ width: 2, height: 2 });
  });

  it("P-12 empty file, plain text and unsupported slicers give a clear error, never a crash", async () => {
    await expect(parseGcodeFile(new Blob([""]))).rejects.toThrow(/empty/);
    await expect(parseGcodeFile(new Blob(["hello world\n"]))).rejects.toThrow(
      "This file's slicer isn't supported. Export plain .gcode from Creality Print, PrusaSlicer, OrcaSlicer or Bambu Studio and try again.",
    );
    await expect(
      parseGcodeFile(new Blob([";FLAVOR:Marlin\n;TIME:600\n;Generated with Cura_SteamEngine 5.7.1\nG28\n"])),
    ).rejects.toThrow(/Cura files don't record the filament grams/);
    await expect(parseGcodeFile(new Blob(["GCDE\u0001\u0000\u0000\u0000binary"]))).rejects.toThrow(/binary G-code/);
  });

  it("parseGcodeChunks works on chunks read separately", async () => {
    const chunks = await readGcodeChunks(
      new Blob([syntheticGcode({ objects: [{ name: "a.stl", ids: ["1"] }], totalGrams: 3 })]),
    );
    expect(parseGcodeChunks(chunks).objects[0]!.count).toBe(1);
  });

  it("durationToSeconds", () => {
    expect(durationToSeconds("1h 47m 30s")).toBe(6450);
    expect(durationToSeconds("1d 2h")).toBe(93600);
    expect(durationToSeconds("soon")).toBeNull();
  });
});

describe.skipIf(!haveFixture("stand"))("Joe's PrusaSlicer file (fixture present locally)", () => {
  it("P-15 stand: PrusaSlicer 2.7.2 for the Ender-3 V3 SE", async () => {
    const g = await parseGcodeFile(fixtureBlob("stand"));
    expect(g).toMatchObject({
      parser: "prusaslicer_gcode",
      slicerName: "PrusaSlicer",
      slicerVersion: "2.7.2",
      printerModel: "ENDER3V3SE",
      nozzleMm: 0.4,
      material: "PLA",
      colour: "#29B2B2",
      layerHeightMm: 0.28,
      totalLayers: null,
      totalGrams: 41.46,
      totalMm: 13788.48,
      totalCm3: 33.17,
      estimatedSeconds: 6703, // 1h 51m 43s
      nozzleTempC: 210,
      bedTempC: 50,
      infillPct: 15,
      infillPattern: "grid",
      wallLoops: 2,
      supportType: "none",
      supportsEnabled: false,
      slicerFilamentCost: 25,
      objects: [], // "Label objects" was off: the import form offers one item
      thumbnails: [],
    });
    expect(Object.keys(g.rawHeader).length).toBeGreaterThan(250);
    expect(printerModelsMatch(g.printerModel!, "Creality Ender-3 V3 SE")).toBe(true);
  });
});

describe("PrusaSlicer (synthetic, always runs)", () => {
  it("reads totals, time and settings from a PrusaSlicer file", async () => {
    const g = await parseGcodeFile(
      new Blob([syntheticPrusaGcode({ totalGrams: 12.5, objects: [{ name: "hook.stl", ids: ["0", "1"] }] })]),
    );
    expect(g).toMatchObject({
      parser: "prusaslicer_gcode",
      slicerName: "PrusaSlicer",
      slicerVersion: "2.8.1",
      printerModel: "Creality Ender-3 V3 SE", // printer_model empty: falls back to the profile name
      material: "PETG",
      colour: "#FF8000",
      totalGrams: 12.5,
      totalMm: 2000.5,
      totalCm3: 4.81,
      estimatedSeconds: 7384,
      nozzleTempC: 240,
      bedTempC: 60,
      infillPct: 20,
      infillPattern: "gyroid",
      wallLoops: 3,
      supportsEnabled: false,
      supportType: "none",
      slicerFilamentCost: 20,
    });
    expect(g.objects).toEqual([{ rawName: "hook.stl", displayName: "hook", count: 2 }]);
  });

  it("is chosen over Creality Print even when the printer profile says Creality", async () => {
    const g = await parseGcodeFile(new Blob([syntheticPrusaGcode({ totalGrams: 3 })]));
    expect(g.parser).toBe("prusaslicer_gcode");
  });

  it("reads supports and PNG thumbnails", async () => {
    const g = await parseGcodeFile(new Blob([syntheticPrusaGcode({ totalGrams: 3, supports: true, thumbnail: true })]));
    expect(g).toMatchObject({ supportsEnabled: true, supportType: "organic" });
    expect(pngSize(g.thumbnails[0]!.base64Png)).toEqual({ width: 2, height: 2 });
  });

  it("OrcaSlicer files use the Orca-family parser under their own id", async () => {
    const text = syntheticGcode({ objects: [{ name: "a.stl", ids: ["1"] }], totalGrams: 4 }).replace(
      "generated by Creality_Print V7.3.2.6412",
      "generated by OrcaSlicer 2.2.0",
    );
    const g = await parseGcodeFile(
      new Blob([text.replace("; printer_settings_id = Creality", "; printer_settings_id = Ender")]),
    );
    expect(g).toMatchObject({
      parser: "orca_slicer_gcode",
      slicerName: "OrcaSlicer",
      slicerVersion: "2.2.0",
      totalGrams: 4,
    });
  });
});

describe("printer model check (D16)", () => {
  it("matches across slicer spellings and still catches a different printer", () => {
    expect(printerModelsMatch("ENDER3V3SE", "Creality Ender-3 V3 SE")).toBe(true);
    expect(printerModelsMatch("Creality Ender-3 V3 SE", "Ender-3 V3 SE")).toBe(true);
    expect(printerModelsMatch("Creality Ender-3 V3 SE", "Bambu A1")).toBe(false);
  });
});

describe("P-14 grams check (D17)", () => {
  it("passes within max(2 g, 2%) and fails just outside", () => {
    expect(gramsMatch([{ qty: 4, gramsPerPiece: 2.1175 }], 8.47).ok).toBe(true);
    expect(
      gramsMatch(
        [
          { qty: 2, gramsPerPiece: 10 },
          { qty: 1, gramsPerPiece: 6.9 },
        ],
        25,
      ).ok,
    ).toBe(true); // 26.9 vs 25: gap 1.9 ≤ 2
    expect(
      gramsMatch(
        [
          { qty: 2, gramsPerPiece: 10 },
          { qty: 1, gramsPerPiece: 7.1 },
        ],
        25,
      ).ok,
    ).toBe(false); // gap 2.1
    const big = gramsMatch([{ qty: 1, gramsPerPiece: 204 }], 200); // 2% of 200 = 4 g allowed
    expect(big).toMatchObject({ ok: true, allowed: 4, gap: 4 });
    expect(gramsMatch([{ qty: 1, gramsPerPiece: 204.1 }], 200).ok).toBe(false);
  });
});
