import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  costShares,
  failureMethod,
  gramsUsed,
  jobCost,
  machineCostPerHour,
  profitPerHour,
  unitCost,
  wasteCost,
  weightedAverage,
  type JobCost,
} from "@/lib/cost";

/**
 * Worked numbers from docs/IMPLEMENTATION-PLAN.md §M1. Assumptions:
 * PLA $17.50/kg, electricity $0.64/kWh, 0.12 kW, machine $200 ÷ 3,000 h (TEST VALUE ONLY).
 */
const CG = 17.5 / 1000;
const KWH = 0.64;
const KW = 0.12;
const CM = machineCostPerHour(200, 3000)!;
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);

const job = (grams: number, seconds: number) =>
  jobCost({
    filaments: [{ grams, costPerGramUsd: CG }],
    hours: seconds / 3600,
    powerKw: KW,
    kwhPriceUsd: KWH,
    machineCostPerHourUsd: CM,
  }) as JobCost;

describe("worked examples", () => {
  it("C-01 padel holder job cost", () => {
    const j = job(29.22, 6450.35);
    expect(j.complete).toBe(true);
    close(j.filament, 0.51135);
    close(j.electricity, 0.13761);
    close(j.wear, 0.11945);
    close(j.total, 0.76841);
  });
  it("C-02/C-03 padel unit cost: allowance 0.87319, actual 0.76841", () => {
    const { total } = job(29.22, 6450.35);
    close(unitCost({ share: total, planned: 1, good: 1, method: "allowance", allowancePct: 12 })!, 0.87319);
    close(unitCost({ share: total, planned: 1, good: 1, method: "actual", allowancePct: 12 })!, 0.76841);
  });
  it("C-04 croix job cost", () => {
    const j = job(8.47, 4094.37);
    close(j.filament, 0.14823);
    close(j.electricity, 0.08735);
    close(j.wear, 0.07582);
    close(j.total, 0.31139);
  });
  it("C-05 croix allowance, 4 planned: 0.08846", () => {
    close(
      unitCost({ share: job(8.47, 4094.37).total, planned: 4, good: 4, method: "allowance", allowancePct: 12 })!,
      0.08846,
    );
  });
  it("C-06 croix actual, 3 of 4 good: unit 0.10380, waste 0.07785", () => {
    const { total } = job(8.47, 4094.37);
    close(unitCost({ share: total, planned: 4, good: 3, method: "actual", allowancePct: 12 })!, 0.1038);
    close(wasteCost(total, 4, 3), 0.07785);
  });
  it("C-07 nothing survived: no unit cost, whole share is waste", () => {
    const { total } = job(8.47, 4094.37);
    expect(unitCost({ share: total, planned: 4, good: 0, method: "actual", allowancePct: 12 })).toBeNull();
    close(wasteCost(total, 4, 0), 0.31139);
  });
  it("C-08 split by grams: A 2×10 g, B 1×5 g of $1.00 → 0.80 / 0.20", () => {
    const [a, b] = costShares(
      [
        { qty: 2, gramsPerPiece: 10 },
        { qty: 1, gramsPerPiece: 5 },
      ],
      1,
    );
    close(a!, 0.8);
    close(b!, 0.2);
  });
  it("C-09 method switches at the 20th print", () => {
    expect(failureMethod(19)).toBe("allowance");
    expect(failureMethod(20)).toBe("actual");
    expect(failureMethod(5, 5)).toBe("actual");
  });
  it("C-10 recipe override 20% divides by 0.80", () => {
    expect(unitCost({ share: 0.8, planned: 1, good: 1, method: "allowance", allowancePct: 20 })).toBeCloseTo(1, 9);
  });
  it("C-11 stopped at 60% scales grams; weighed grams win; override is used", () => {
    expect(gramsUsed({ recipeGrams: 8.47, stoppedAtPct: 60 })).toEqual({
      grams: expect.closeTo(5.082, 9),
      source: "recipe_estimate",
    });
    expect(gramsUsed({ recipeGrams: 8.47, stoppedAtPct: 60, weighedGrams: 6 })).toEqual({
      grams: 6,
      source: "weighed",
    });
    expect(gramsUsed({ recipeGrams: 8.47, gramsOverride: 9 })).toEqual({ grams: 9, source: "override" });
  });
  it("C-12 two spools average: $17 + $18 per kg → $0.0175/g", () => {
    expect(weightedAverage(1000, 0.017, 1000, 0.018)).toBeCloseTo(0.0175, 12);
  });
  it("C-13 500 g at 0.0175 + 1,000 g at 0.020 → 0.0191667/g", () => {
    expect(weightedAverage(500, 0.0175, 1000, 0.02)).toBeCloseTo(0.0191667, 7);
  });
  it("weighted average restarts from the purchase price when stock is zero or negative (D36)", () => {
    expect(weightedAverage(0, 0.0175, 1000, 0.02)).toBe(0.02);
    expect(weightedAverage(-3, 0.5, 10, 0.4)).toBe(0.4);
  });
  it("C-14 missing inputs → incomplete with every missing input named", () => {
    expect(
      jobCost({
        filaments: [{ grams: 5, costPerGramUsd: null }],
        hours: 1,
        powerKw: null,
        kwhPriceUsd: null,
        machineCostPerHourUsd: null,
      }),
    ).toEqual({
      complete: false,
      missing: ["electricity_price", "machine_power", "machine_cost", "filament_cost"],
    });
    expect(machineCostPerHour(null, 3000)).toBeNull();
    expect(machineCostPerHour(200, 0)).toBeNull();
  });
  it("C-16 profit per hour: $5, cost 0.87319, packaging 0.30, 15 min → $15.31/h; no minutes → null", () => {
    expect(
      profitPerHour({ unitPrice: 5, unitCost: 0.87319, packagingCost: 0.3, qty: 1, labourMinutesPerUnit: 15 }),
    ).toBeCloseTo(15.30724, 5);
    expect(
      profitPerHour({ unitPrice: 5, unitCost: 1, packagingCost: 0, qty: 2, labourMinutesPerUnit: null }),
    ).toBeNull();
  });
});

describe("C-17 properties", () => {
  const item = fc.record({
    qty: fc.integer({ min: 1, max: 50 }),
    gramsPerPiece: fc.double({ min: 0.1, max: 500, noNaN: true }),
  });
  it("shares always sum to the job cost and are never negative", () => {
    fc.assert(
      fc.property(
        fc.array(item, { minLength: 1, maxLength: 8 }),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        (items, total) => {
          const shares = costShares(items, total);
          expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(total, 6);
          expect(shares.every((s) => s >= 0)).toBe(true);
        },
      ),
    );
  });
  it("unit cost is never negative and actual ≥ share ÷ planned", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 40 }),
        (share, planned, goodRaw) => {
          const good = Math.min(goodRaw, planned);
          const u = unitCost({ share, planned, good, method: "actual", allowancePct: 12 })!;
          expect(u).toBeGreaterThanOrEqual(0);
          expect(u + 1e-12).toBeGreaterThanOrEqual(share / planned);
        },
      ),
    );
  });
  it("weighted average stays between the lowest and highest price", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.001, max: 10_000, noNaN: true }),
        fc.double({ min: 0.0001, max: 1, noNaN: true }),
        fc.double({ min: 0.001, max: 10_000, noNaN: true }),
        fc.double({ min: 0.0001, max: 1, noNaN: true }),
        (onHand, oldAvg, added, price) => {
          const avg = weightedAverage(onHand, oldAvg, added, price);
          expect(avg).toBeGreaterThanOrEqual(Math.min(oldAvg, price) - 1e-12);
          expect(avg).toBeLessThanOrEqual(Math.max(oldAvg, price) + 1e-12);
        },
      ),
    );
  });
});
