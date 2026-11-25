import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

/**
 * Joe's real G-code files are not committed (public repo). They live gzipped in
 * tests/fixtures/ locally; tests that need them are skipped when absent.
 */
export const FIXTURES = {
  padel: "tests/fixtures/adidas-padel-racket-holder.gcode.gz",
  croix: "tests/fixtures/new-croix_pla_1h8m.gcode.gz",
} as const;

export const haveFixtures = Object.values(FIXTURES).every((p) => existsSync(p));

export function fixtureBlob(name: keyof typeof FIXTURES): Blob {
  return new Blob([gunzipSync(readFileSync(FIXTURES[name]))]);
}
