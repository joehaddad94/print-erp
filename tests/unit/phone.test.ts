import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone, whatsappUrl } from "@/lib/phone";

const ok = (s: string) => {
  const r = normalizePhone(s);
  return r.ok ? r.e164 : r.error;
};

describe("R5 phones (E.164)", () => {
  it("Lebanese numbers typed any way become +961…", () => {
    for (const s of ["70123456", "070 123 456", "+961 70 123 456", "961-70-123-456", "0096170123456", "(70) 123.456"])
      expect(ok(s)).toBe("+96170123456");
    expect(ok("03 123 456")).toBe("+9613123456");
  });
  it("another country keeps its code when it starts with + or 00", () => {
    expect(ok("+33 6 12 34 56 78")).toBe("+33612345678");
    expect(ok("0033612345678")).toBe("+33612345678");
  });
  it("refuses what isn't a phone number", () => {
    for (const s of ["12", "70 123 456 789 000 1", "call me", "70+123456", "+12"])
      expect(normalizePhone(s).ok).toBe(false);
  });
  it("shows Lebanese numbers grouped and builds WhatsApp links", () => {
    expect(formatPhone("+96170123456")).toBe("+961 70 123 456");
    expect(formatPhone("+9613123456")).toBe("+961 3 123 456");
    expect(formatPhone("+33612345678")).toBe("+33612345678");
    expect(formatPhone(null)).toBe("");
    expect(whatsappUrl("+96170123456")).toBe("https://wa.me/96170123456");
  });
});
