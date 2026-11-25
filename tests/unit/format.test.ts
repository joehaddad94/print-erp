import { describe, expect, it } from "vitest";
import { formatDuration } from "@/lib/format";

describe("formatDuration", () => {
  it("shows hours and minutes, minutes only, or a dash", () => {
    expect(formatDuration(4094)).toBe("1 h 8 min");
    expect(formatDuration(45 * 60)).toBe("45 min");
    expect(formatDuration(null)).toBe("—");
  });
});
