import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * U-02: every text/background token pair that components use meets WCAG AA
 * (4.5:1 for text) in light and dark. Values are read from src/styles/tokens.css.
 */
const css = readFileSync("src/styles/tokens.css", "utf8");

function block(selectorStart: number): Record<string, string> {
  const open = css.indexOf("{", selectorStart);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") depth--;
    if (depth === 0) {
      end = i;
      break;
    }
  }
  const out: Record<string, string> = {};
  for (const m of css.slice(open, end).matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const light = block(css.indexOf(":root {"));
const dark = { ...light, ...block(css.indexOf(':root[data-theme="dark"]')) };

function resolve(vars: Record<string, string>, name: string): string {
  let v = vars[name]!;
  for (let i = 0; i < 5 && v.startsWith("var("); i++) v = vars[v.slice(6, -1)]!;
  if (v === "#fff") return "#ffffff";
  return v;
}

function luminance(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

export function ratio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** [text token, background token] pairs as used in components/ui. */
const PAIRS: [string, string][] = [
  ["ink", "bg"],
  ["ink", "surface"],
  ["ink-muted", "bg"],
  ["ink-muted", "surface"],
  ["action-ink", "action"],
  ["action", "surface"],
  ["action", "bg"],
  ["ink", "action-soft"],
  ["tone-success", "tone-success-bg"],
  ["tone-warning", "tone-warning-bg"],
  ["tone-danger", "tone-danger-bg"],
  ["tone-info", "tone-info-bg"],
  ["tone-neutral", "tone-neutral-bg"],
  ["tone-danger", "surface"],
  ["ink", "tone-info-bg"],
  ["ink", "tone-warning-bg"],
  ["ink", "tone-danger-bg"],
  ["ink", "tone-success-bg"],
  ["ch-wa", "ch-wa-bg"],
  ["ch-ig", "ch-ig-bg"],
];

describe("U-02 token contrast ≥ 4.5:1", () => {
  for (const [theme, vars] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    for (const [fg, bg] of PAIRS) {
      it(`${theme}: ${fg} on ${bg}`, () => {
        expect(ratio(resolve(vars, fg), resolve(vars, bg))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
