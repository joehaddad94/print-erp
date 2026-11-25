import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

describe("U-05 Tailwind lint rule", () => {
  // eslint-disable-next-line no-restricted-syntax -- the test name quotes the forbidden pattern
  it("rejects arbitrary values like w-[37px]", async () => {
    const eslint = new ESLint({ ignore: false });
    const [result] = await eslint.lintFiles(["tests/lint-fixtures/arbitrary.tsx"]);
    expect(result!.messages.map((m) => m.message).join("\n")).toMatch(/Arbitrary Tailwind value/);
  }, 60_000);
  it("accepts token classes", async () => {
    const eslint = new ESLint();
    const [result] = await eslint.lintText(
      'export const Ok = () => <div className="min-h-tap bg-surface text-ink" />;\n',
      {
        filePath: "src/ok.tsx",
      },
    );
    expect(result!.messages.filter((m) => m.ruleId === "no-restricted-syntax")).toHaveLength(0);
  }, 60_000);
});
