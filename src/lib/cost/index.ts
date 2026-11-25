/**
 * Cost formulas from the spec ("Cost per good unit", D11, D15, D17, D20, D23, D24, D26, D27, D38).
 * Pure functions, USD, full precision; round only for display.
 */

export type Incomplete = { complete: false; missing: MissingInput[] };
export type MissingInput = "electricity_price" | "machine_power" | "machine_cost" | "filament_cost";

/** c_m: machine cost per hour = purchase cost (USD) ÷ expected life hours (D27). */
export function machineCostPerHour(purchaseUsd: number | null, expectedLifeHours: number | null): number | null {
  if (purchaseUsd == null || !expectedLifeHours || expectedLifeHours <= 0) return null;
  return purchaseUsd / expectedLifeHours;
}

export type JobCostInput = {
  filaments: { grams: number; costPerGramUsd: number | null }[];
  hours: number;
  powerKw: number | null;
  kwhPriceUsd: number | null;
  machineCostPerHourUsd: number | null;
};

export type JobCost = { complete: true; filament: number; electricity: number; wear: number; total: number };

/** job cost = Σ g·c_g + k·h·c_e + h·c_m. Any missing input → incomplete, never a guessed number (spec step 4). */
export function jobCost(i: JobCostInput): JobCost | Incomplete {
  const missing: MissingInput[] = [];
  if (i.kwhPriceUsd == null) missing.push("electricity_price");
  if (i.powerKw == null) missing.push("machine_power");
  if (i.machineCostPerHourUsd == null) missing.push("machine_cost");
  if (i.filaments.some((f) => f.costPerGramUsd == null)) missing.push("filament_cost");
  if (missing.length) return { complete: false, missing };
  const filament = i.filaments.reduce((s, f) => s + f.grams * f.costPerGramUsd!, 0);
  const electricity = i.powerKw! * i.hours * i.kwhPriceUsd!;
  const wear = i.hours * i.machineCostPerHourUsd!;
  return { complete: true, filament, electricity, wear, total: filament + electricity + wear };
}

/** share_i = job cost × (q_i·w_i) ÷ Σ q_j·w_j (D17). Shares always sum to the job cost. */
export function costShares(items: { qty: number; gramsPerPiece: number }[], jobCostUsd: number): number[] {
  const weights = items.map((i) => i.qty * i.gramsPerPiece);
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return items.map(() => 0);
  return weights.map((w) => (jobCostUsd * w) / sum);
}

export type FailureMethod = "allowance" | "actual";

/** D11: the allowance applies until `actualAfter` prints are logged, then actual failed units. */
export function failureMethod(finishedPrintsBefore: number, actualAfter = 20): FailureMethod {
  return finishedPrintsBefore >= actualAfter ? "actual" : "allowance";
}

/**
 * unit cost_i: allowance → share ÷ (q·(1 − a)); actual → share ÷ good.
 * Returns null when nothing survived (good = 0): the whole share is waste (D20).
 */
export function unitCost(o: {
  share: number;
  planned: number;
  good: number;
  method: FailureMethod;
  allowancePct: number;
}): number | null {
  if (o.good <= 0) return null;
  if (o.method === "allowance") return o.share / (o.planned * (1 - o.allowancePct / 100));
  return o.share / o.good;
}

/** Waste cost_i = share × failed ÷ planned: reported, not charged a second time (D20). */
export function wasteCost(share: number, planned: number, good: number): number {
  if (planned <= 0) return 0;
  return (share * Math.max(0, planned - good)) / planned;
}

/** g per filament (D23): weighed grams win; else recipe grams (override if set) × stopped-at %. */
export function gramsUsed(o: {
  recipeGrams: number;
  gramsOverride?: number | null;
  stoppedAtPct?: number;
  weighedGrams?: number | null;
}): { grams: number; source: "weighed" | "override" | "recipe_estimate" } {
  if (o.weighedGrams != null) return { grams: o.weighedGrams, source: "weighed" };
  const base = o.gramsOverride ?? o.recipeGrams;
  return {
    grams: (base * (o.stoppedAtPct ?? 100)) / 100,
    source: o.gramsOverride != null ? "override" : "recipe_estimate",
  };
}

/**
 * Weighted average cost after a stock-in (D23, D38):
 * (on hand × old avg + added × unit cost) ÷ (on hand + added).
 * When stock on hand is zero or negative (D36), the new average is the incoming unit cost.
 */
export function weightedAverage(onHand: number, oldAvg: number | null, added: number, addedUnitCost: number): number {
  if (added <= 0) throw new RangeError("added must be positive");
  if (onHand <= 0 || oldAvg == null) return addedUnitCost;
  return (onHand * oldAvg + added * addedUnitCost) / (onHand + added);
}

/** Labour minutes per piece on a plate (D24): recipe labour minutes ÷ pieces planned on the plate. */
export function labourMinutesPerPiece(labourMinutes: number | null, piecesOnPlate: number): number | null {
  if (labourMinutes == null || piecesOnPlate <= 0) return null;
  return labourMinutes / piecesOnPlate;
}

/** Profit per hour of your time (D24). Null when minutes are missing or zero: shown as "—". */
export function profitPerHour(o: {
  unitPrice: number;
  unitCost: number;
  packagingCost: number;
  qty: number;
  labourMinutesPerUnit: number | null;
}): number | null {
  if (!o.labourMinutesPerUnit || o.labourMinutesPerUnit <= 0) return null;
  const profit = (o.unitPrice - o.unitCost - o.packagingCost) * o.qty;
  return profit / ((o.labourMinutesPerUnit * o.qty) / 60);
}
