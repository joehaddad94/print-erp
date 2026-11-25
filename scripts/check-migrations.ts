/**
 * Plan §5: (4) a migration may only add, unless its file name contains "contract";
 * (5) migrations already on origin/main are never edited.
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const DESTRUCTIVE =
  /\b(drop\s+(table|column|type|view|index|schema|constraint)|alter\s+column\s+\S+\s+(set\s+data\s+)?type|rename\s+(column|to))\b/i;
const problems: string[] = [];

for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql"))) {
  const sqlText = readFileSync(`drizzle/${file}`, "utf8").replace(/--.*$/gm, "");
  if (!file.includes("contract") && DESTRUCTIVE.test(sqlText))
    problems.push(`${file}: destructive statement in an expand-only migration`);
}

try {
  const base = execSync("git merge-base HEAD origin/main", { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
  const changed = execSync(`git diff --name-status ${base} -- drizzle/`, { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
  for (const line of changed.split("\n").filter(Boolean)) {
    const [status, path] = line.split(/\s+/);
    if (status !== "A" && path?.endsWith(".sql"))
      problems.push(`${path}: merged migration was ${status === "D" ? "deleted" : "edited"}`);
  }
} catch {
  console.log("check-migrations: no origin/main to compare against, skipping the 'never edited' check");
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("check-migrations: ok");
