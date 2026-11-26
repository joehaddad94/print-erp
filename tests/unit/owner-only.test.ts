import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generatePassword, passwordProblem, PASSWORD_ALPHABET } from "@/lib/auth/generate";
import { NAV } from "@/components/shell/nav";

describe("R1 generated passwords", () => {
  it("4 groups of 4 from the alphabet without look-alikes", () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
      expect(p).not.toMatch(/[01ilo]/);
      for (const c of p.replace(/-/g, "")) expect(PASSWORD_ALPHABET).toContain(c);
    }
  });
  it("never repeats in 5,000 draws and uses the whole alphabet roughly evenly", () => {
    const seen = new Set<string>();
    const counts = new Map<string, number>();
    for (let i = 0; i < 5000; i++) {
      const p = generatePassword();
      seen.add(p);
      for (const c of p.replace(/-/g, "")) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    expect(seen.size).toBe(5000);
    expect(counts.size).toBe(PASSWORD_ALPHABET.length);
    const expected = (5000 * 16) / PASSWORD_ALPHABET.length; // ≈ 2581
    for (const n of counts.values()) expect(Math.abs(n - expected) / expected).toBeLessThan(0.12);
  });
  it("a chosen password needs 10+ characters and can't be the username", () => {
    expect(passwordProblem("short", "joe")).toMatch(/10/);
    expect(passwordProblem("Rami123456", "rami123456")).toMatch(/username/);
    expect(passwordProblem("a perfectly fine one", "joe")).toBeNull();
  });
});

/** R1: staff can't see Change history, download backups or manage people. Checked at the source. */
describe("R1 owner-only guards", () => {
  const src = (f: string) => readFileSync(f, "utf8");
  it("Change history page requires an owner", () => {
    expect(src("src/app/(app)/history/page.tsx")).toMatch(/await requireOwner\(\)/);
  });
  it("every people action except changing your own password requires an owner", () => {
    const s = src("src/server/people/actions.ts");
    for (const name of ["addPersonAction", "resetPasswordAction", "removePersonAction"]) {
      const body = s.slice(s.indexOf(`function ${name}`));
      expect(body.split("\n").slice(0, 3).join("\n")).toMatch(/await requireOwner\(\)/);
    }
  });
  it("backup download refuses non-owners with 403", () => {
    expect(src("src/app/api/backup/route.ts")).toMatch(/!isOwner\(user\)[\s\S]{0,120}status: 403/);
  });
  it("owner-only nav items are flagged so staff don't see them", () => {
    const owner = NAV.flatMap((g) => g.items)
      .filter((i) => i.owner)
      .map((i) => i.href);
    expect(owner).toEqual(["/history"]);
  });
});
