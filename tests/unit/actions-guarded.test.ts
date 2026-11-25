import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** A-05: every exported Server Action calls requireUser() first, except the listed public ones. */
const PUBLIC_ACTIONS = new Set(["loginAction"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

const actionFiles = files("src").filter((f) => /^\s*["']use server["']/m.test(readFileSync(f, "utf8")));

describe("A-05 Server Actions are guarded", () => {
  it("finds action files", () => expect(actionFiles.length).toBeGreaterThan(0));
  for (const file of actionFiles) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/export async function (\w+)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)) {
      const [, name, body] = m;
      if (PUBLIC_ACTIONS.has(name!)) continue;
      it(`${file}: ${name} starts with requireUser()`, () => {
        const firstStatement = body!.trim().split("\n")[0]!;
        expect(firstStatement).toMatch(/await requireUser\(\)/);
      });
    }
  }
});
