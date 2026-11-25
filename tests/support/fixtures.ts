import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

/**
 * Joe's real G-code files are not committed (public repo). They live gzipped in
 * tests/fixtures/ locally; tests that need them are skipped when absent.
 */
export const FIXTURES = {
  padel: "tests/fixtures/adidas-padel-racket-holder.gcode.gz",
  croix: "tests/fixtures/new-croix_pla_1h8m.gcode.gz",
  /** PrusaSlicer 2.7.2, Ender-3 V3 SE, printed by Joe on 2026-11-25. */
  stand: "tests/fixtures/stand-v3se-prusaslicer.gcode.gz",
} as const;

export const haveFixture = (name: keyof typeof FIXTURES) => existsSync(FIXTURES[name]);
export const haveFixtures = haveFixture("padel") && haveFixture("croix");

export function fixtureBlob(name: keyof typeof FIXTURES): Blob {
  return new Blob([gunzipSync(readFileSync(FIXTURES[name]))]);
}
