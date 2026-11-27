import { costShares, jobCost, unitCost, type JobCost, type MissingInput } from "@/lib/cost";
import type { CostInputs } from "@/server/calculator/service";

export type RecipeForEstimate = {
  material: string | null;
  totalGrams: number | null;
  gramsOverride: number | null;
  estimatedSeconds: number | null;
  wasteAllowancePctOverride: number | null;
};

export type RecipeEstimate = {
  grams: number | null;
  hours: number | null;
  /** null when an input is missing (never a guessed number). */
  job: JobCost | null;
  missing: MissingInput[];
  /** Cost per good piece for each item on the plate, in the same order (null when unknown). */
  perPiece: (number | null)[];
};

/**
 * What one plate of a recipe costs if printed now (D32): the same formula as Start print and the
 * calculator, with today's average price of the recipe's material and the first active printer.
 */
export function recipeEstimate(
  r: RecipeForEstimate,
  items: { qtyOnPlate: number; gramsPerPiece: number }[],
  inputs: CostInputs,
): RecipeEstimate {
  const grams = r.gramsOverride ?? r.totalGrams;
  const hours = r.estimatedSeconds != null ? r.estimatedSeconds / 3600 : null;
  const material = r.material?.toLowerCase();
  const prices = inputs.filaments
    .filter((f) => f.costPerGramUsd != null && material && f.material?.toLowerCase() === material)
    .map((f) => f.costPerGramUsd!);
  const costPerGram = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
  const printer = inputs.printers[0];
  if (grams == null || hours == null || !items.length)
    return { grams, hours, job: null, missing: [], perPiece: items.map(() => null) };
  const res = jobCost({
    filaments: [{ grams, costPerGramUsd: costPerGram }],
    hours,
    powerKw: printer?.powerKw ?? null,
    kwhPriceUsd: inputs.kwhPriceUsd,
    machineCostPerHourUsd: printer?.costPerHourUsd ?? null,
  });
  if (!res.complete) return { grams, hours, job: null, missing: res.missing, perPiece: items.map(() => null) };
  const shares = costShares(
    items.map((i) => ({ qty: i.qtyOnPlate, gramsPerPiece: i.gramsPerPiece })),
    res.total,
  );
  const allowancePct = r.wasteAllowancePctOverride ?? inputs.allowancePct;
  return {
    grams,
    hours,
    job: res,
    missing: [],
    perPiece: items.map((i, k) =>
      unitCost({
        share: shares[k]!,
        planned: i.qtyOnPlate,
        good: i.qtyOnPlate,
        method: inputs.method,
        allowancePct,
      }),
    ),
  };
}
