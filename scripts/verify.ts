/**
 * `pnpm verify`: every gate in docs/IMPLEMENTATION-PLAN.md §1, in order, stopping at the first failure.
 * Prints a summary block that goes into each PR description.
 */
import { execSync, spawnSync } from "node:child_process";

const steps: { name: string; cmd: string }[] = [
  { name: "typecheck", cmd: "pnpm exec next typegen && pnpm exec tsc --noEmit" },
  { name: "lint", cmd: "pnpm exec eslint --max-warnings=0 ." },
  { name: "format", cmd: "pnpm exec prettier --check ." },
  { name: "migrations", cmd: "pnpm exec tsx scripts/check-migrations.ts" },
  { name: "drift", cmd: "pnpm exec drizzle-kit check" },
  { name: "unit", cmd: "pnpm exec vitest run --project unit" },
  { name: "db", cmd: "pnpm exec vitest run --project db" },
  { name: "build", cmd: "pnpm exec next build" },
  { name: "e2e", cmd: "pnpm exec playwright test" },
];

const only = process.argv.slice(2);
const results: string[] = [];
const started = Date.now();

for (const step of steps.filter((s) => !only.length || only.includes(s.name))) {
  const t = Date.now();
  const run = spawnSync(step.cmd, { shell: true, encoding: "utf8", env: { ...process.env, FORCE_COLOR: "0" } });
  // eslint-disable-next-line no-control-regex -- strip ANSI colour codes
  const out = `${run.stdout}\n${run.stderr}`.replace(/\x1b\[[0-9;]*m/g, "");
  const secs = ((Date.now() - t) / 1000).toFixed(0);
  const counts =
    out.match(/Tests\s+(\d+ passed[^\n]*)/)?.[1] ??
    out.match(/(\d+ passed[^\n]*)/)?.[1] ??
    (run.status === 0 ? "ok" : "failed");
  results.push(`${run.status === 0 ? "PASS" : "FAIL"}  ${step.name.padEnd(10)} ${counts.trim()} (${secs}s)`);
  if (run.status !== 0) {
    console.log(out.split("\n").slice(-60).join("\n"));
    break;
  }
}

const commit = execSync("git rev-parse --short HEAD").toString().trim();
const dirty = execSync("git status --porcelain").toString().trim() ? " (+ uncommitted changes)" : "";
const allPass = results.every((r) => r.startsWith("PASS")) && results.length === (only.length || steps.length);
console.log(
  [
    "```text",
    `pnpm verify @ ${commit}${dirty} · ${new Date().toISOString()} · ${((Date.now() - started) / 1000).toFixed(0)}s`,
    ...results,
    allPass ? "RESULT: ALL GREEN" : "RESULT: FAILED",
    "```",
  ].join("\n"),
);
process.exit(allPass ? 0 : 1);
