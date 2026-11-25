import { describe, expect, it } from "vitest";
import { describeUrl, hint } from "../../scripts/bootstrap";

describe("deploy diagnostics", () => {
  it("never prints the password", () => {
    const s = describeUrl("postgresql://postgres.abc:s3cret@aws-0-eu.pooler.supabase.com:5432/postgres");
    expect(s).toBe("postgres.abc@aws-0-eu.pooler.supabase.com:5432/postgres");
    expect(s).not.toContain("s3cret");
  });
  it("names the likely fix for common Supabase mistakes", () => {
    expect(hint({ code: "28P01" })).toMatch(/Wrong database password/);
    expect(hint(new Error("Tenant or user not found"))).toMatch(/postgres\.<project-ref>/);
    expect(hint({ code: "ENOTFOUND" })).toMatch(/Session pooler/);
    expect(hint(new Error("something else"))).toBe("");
  });
});
