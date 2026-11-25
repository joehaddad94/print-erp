import { costShares, jobCost, unitCost, wasteCost, type FailureMethod, type MissingInput } from "@/lib/cost";

/** What Start snapshotted (rule 4) plus the plate lines. Pure input to the Finish maths. */
export type JobForFinish = {
  kwhPriceUsd: number | null;
  powerKw: number | null;
  machineCostPerHourUsd: number | null;
  method: FailureMethod;
  allowancePct: number;
  filaments: { id: number; plannedGrams: number; costPerGramUsd: number | null; fromOverride: boolean }[];
  items: { id: number; qtyPlanned: number; gramsPerPiece: number }[];
};

export type FinishInput = {
  hours: number;
  stoppedAtPct: number;
  /** Weighed grams per filament line; null/absent = not weighed. */
  weighed: Record<number, number | null | undefined>;
  /** Good pieces per item line. */
  good: Record<number, number>;
};

export type FinishResult =
  | { complete: false; missing: MissingInput[] }
  | {
      complete: true;
      filament: number;
      electricity: number;
      wear: number;
      total: number;
      wasteTotal: number;
      /** True while any filament line is not weighed (D23). */
      estimated: boolean;
      filaments: {
        id: number;
        grams: number;
        source: "weighed" | "override" | "recipe_estimate";
        weighedGrams: number | null;
      }[];
      items: {
        id: number;
        good: number;
        gramsShare: number;
        costShare: number;
        unitCost: number | null;
        wasteCost: number;
      }[];
    };

/**
 * Finish maths (spec "Cost per good unit", D11, D17, D20, D23): grams per filament
 * (weighed, else planned × stopped-at %), job cost, split by grams, unit and waste cost per item.
 */
export function computeFinish(job: JobForFinish, input: FinishInput): FinishResult {
  const filaments = job.filaments.map((f) => {
    const w = input.weighed[f.id];
    if (w != null) return { id: f.id, grams: w, source: "weighed" as const, weighedGrams: w };
    return {
      id: f.id,
      grams: (f.plannedGrams * input.stoppedAtPct) / 100,
      source: f.fromOverride ? ("override" as const) : ("recipe_estimate" as const),
      weighedGrams: null,
    };
  });
  const cost = jobCost({
    filaments: filaments.map((f, i) => ({ grams: f.grams, costPerGramUsd: job.filaments[i]!.costPerGramUsd })),
    hours: input.hours,
    powerKw: job.powerKw,
    kwhPriceUsd: job.kwhPriceUsd,
    machineCostPerHourUsd: job.machineCostPerHourUsd,
  });
  if (!cost.complete) return cost;
  const plate = job.items.map((i) => ({ qty: i.qtyPlanned, gramsPerPiece: i.gramsPerPiece }));
  const weightSum = plate.reduce((s, p) => s + p.qty * p.gramsPerPiece, 0);
  const shares = costShares(plate, cost.total);
  const items = job.items.map((it, k) => {
    const good = Math.max(0, Math.min(it.qtyPlanned, Math.round(input.good[it.id] ?? it.qtyPlanned)));
    const share = shares[k]!;
    return {
      id: it.id,
      good,
      gramsShare: weightSum > 0 ? (it.qtyPlanned * it.gramsPerPiece) / weightSum : 0,
      costShare: share,
      unitCost: unitCost({ share, planned: it.qtyPlanned, good, method: job.method, allowancePct: job.allowancePct }),
      wasteCost: wasteCost(share, it.qtyPlanned, good),
    };
  });
  return {
    ...cost,
    wasteTotal: items.reduce((s, i) => s + i.wasteCost, 0),
    estimated: filaments.some((f) => f.source !== "weighed"),
    filaments,
    items,
  };
}
