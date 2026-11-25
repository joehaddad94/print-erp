import { describe, expect, it } from "vitest";
import { formatMoney, rateToUsdFromLbpRate, toUsd } from "@/lib/money";

describe("money", () => {
  it("C-15 LBP expense: 1,790,000 LBP at 89,500 LBP/USD = $20.00", () => {
    const rate = rateToUsdFromLbpRate(89_500);
    expect(rate).toBeCloseTo(1 / 89_500, 15);
    expect(toUsd(1_790_000, rate)).toBeCloseTo(20, 9);
  });
  it("rejects a non-positive LBP rate", () => {
    expect(() => rateToUsdFromLbpRate(0)).toThrow();
  });
  it("formats USD with cents and LBP without", () => {
    expect(formatMoney(0.87319, "USD")).toBe("$0.87");
    expect(formatMoney(1_790_000, "LBP")).toMatch(/1,790,000/);
  });
});
