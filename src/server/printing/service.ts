import { and, asc, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import {
  adjustments,
  machines,
  printJobFilaments,
  printJobItems,
  printJobs,
  products,
  recipeItems,
  recipes,
  stockItems,
  stockMovements,
} from "@/db/schema";
import { failureMethod, labourMinutesPerPiece, machineCostPerHour, type MissingInput } from "@/lib/cost";
import { softDeleteLogged, updateLogged, type Tx } from "@/server/edits/engine";
import { currentSettings } from "@/server/settings/service";
import { currentAverage, onHand, recordMovement, replayAverages } from "@/server/stock/ledger";
import type { ImportInput } from "@/server/recipes/schema";
import { prepareImport, saveImport } from "@/server/recipes/service";
import { computeFinish, type FinishResult, type JobForFinish } from "./compute";

type Db = PostgresJsDatabase<typeof schema>;

export class PrintError extends Error {
  constructor(
    message: string,
    readonly missing?: MissingInput[],
  ) {
    super(message);
    this.name = "PrintError";
  }
}

const MISSING_TEXT: Record<MissingInput, string> = {
  electricity_price: "the electricity price (Settings)",
  machine_power: "the printer's average power (Machines)",
  machine_cost: "the printer's purchase cost (Machines)",
  filament_cost: "a purchase of this filament (Expenses)",
};

export function missingText(missing: MissingInput[]) {
  return missing.map((m) => MISSING_TEXT[m]).join(", ");
}

const num = (v: unknown) => (typeof v === "number" ? v : null);

/** Today's inputs a job snapshots at Start (rule 4). */
async function liveInputs(db: Db | Tx) {
  const s = await currentSettings(db as Db);
  const [finished] = await db
    .select({ n: count() })
    .from(printJobs)
    .where(and(isNotNull(printJobs.finishedAt), isNull(printJobs.deletedAt)));
  return {
    kwhPriceUsd: num(s.electricity_kwh_price),
    allowancePct: num(s.failure_allowance_pct) ?? 12,
    method: failureMethod(finished?.n ?? 0, num(s.failure_actual_after_prints) ?? 20),
  };
}

function machineCost(m: typeof machines.$inferSelect) {
  return m.purchaseAmount == null
    ? null
    : machineCostPerHour(m.purchaseAmount * m.purchaseRateToUsd, m.expectedLifeHours);
}

/** D34: jobs with no finished_at. */
export async function runningJobs(db: Db) {
  return db
    .select({
      id: printJobs.id,
      startedAt: printJobs.startedAt,
      machineId: printJobs.machineId,
      machineName: machines.name,
      recipeName: recipes.name,
      recipeVersion: recipes.version,
      estimatedSeconds: printJobs.estimatedSeconds,
    })
    .from(printJobs)
    .innerJoin(machines, eq(machines.id, printJobs.machineId))
    .innerJoin(recipes, eq(recipes.id, printJobs.recipeId))
    .where(and(isNull(printJobs.finishedAt), isNull(printJobs.deletedAt)))
    .orderBy(asc(printJobs.startedAt));
}

export async function recentJobs(db: Db, limit = 10) {
  return db
    .select({
      id: printJobs.id,
      finishedAt: printJobs.finishedAt,
      machineName: machines.name,
      recipeName: recipes.name,
      jobCostUsd: printJobs.jobCostUsd,
      wasteCostUsd: printJobs.wasteCostUsd,
    })
    .from(printJobs)
    .innerJoin(machines, eq(machines.id, printJobs.machineId))
    .innerJoin(recipes, eq(recipes.id, printJobs.recipeId))
    .where(and(isNotNull(printJobs.finishedAt), isNull(printJobs.deletedAt)))
    .orderBy(desc(printJobs.finishedAt))
    .limit(limit);
}

/** Everything the Start screen needs, in one call. */
export async function startOptions(db: Db) {
  const [recipeRows, machineRows, filamentRows, running, live] = await Promise.all([
    db
      .select()
      .from(recipes)
      .where(and(eq(recipes.isCurrent, true), isNull(recipes.deletedAt)))
      .orderBy(asc(recipes.name)),
    db
      .select()
      .from(machines)
      .where(and(eq(machines.type, "printer"), eq(machines.status, "active"), isNull(machines.deletedAt)))
      .orderBy(asc(machines.name)),
    db
      .select({ id: stockItems.id, name: stockItems.name, material: stockItems.material })
      .from(stockItems)
      .where(and(eq(stockItems.type, "filament"), isNull(stockItems.deletedAt)))
      .orderBy(asc(stockItems.name)),
    runningJobs(db),
    liveInputs(db),
  ]);
  const items = recipeRows.length
    ? await db
        .select({
          recipeId: recipeItems.recipeId,
          qty: recipeItems.qtyOnPlate,
          gramsPerPiece: recipeItems.gramsPerPiece,
          name: products.name,
          productId: recipeItems.productId,
          objectName: recipeItems.objectName,
        })
        .from(recipeItems)
        .innerJoin(products, eq(products.id, recipeItems.productId))
        .where(
          and(
            inArray(
              recipeItems.recipeId,
              recipeRows.map((r) => r.id),
            ),
            isNull(recipeItems.deletedAt),
          ),
        )
    : [];
  const busy = new Map(running.map((j) => [j.machineId, j]));
  return {
    ...live,
    recipes: recipeRows.map((r) => ({
      id: r.id,
      name: r.name,
      version: r.version,
      recipeGroup: r.recipeGroup,
      plateGrams: r.gramsOverride ?? r.totalGrams ?? 0,
      estimatedSeconds: r.estimatedSeconds,
      material: r.material,
      printerModel: r.printerModel,
      nozzleMm: r.nozzleMm,
      allowancePct: r.wasteAllowancePctOverride,
      items: items
        .filter((i) => i.recipeId === r.id)
        .map((i) => ({
          name: i.name,
          qty: i.qty,
          gramsPerPiece: i.gramsPerPiece,
          productId: i.productId,
          objectName: i.objectName,
        })),
    })),
    printers: machineRows.map((m) => {
      const job = busy.get(m.id);
      return {
        id: m.id,
        name: m.name,
        model: m.model,
        nozzleMm: m.nozzleMm,
        powerKw: m.avgPowerKw,
        costPerHourUsd: machineCost(m),
        busy: job ? { jobId: job.id, recipeName: job.recipeName, startedAt: job.startedAt } : null,
      };
    }),
    /** R3: recipes printed lately (current version of each), most recent first, for the picker. */
    recentRecipeIds: await recentRecipes(db, recipeRows),
    filaments: await Promise.all(
      filamentRows.map(async (f) => ({
        ...f,
        costPerGramUsd: await currentAverage(db, f.id),
        onHand: await onHand(db, f.id),
      })),
    ),
  };
}

async function recentRecipes(db: Db, current: { id: number; recipeGroup: string }[]) {
  const rows = await db
    .select({ group: recipes.recipeGroup })
    .from(printJobs)
    .innerJoin(recipes, eq(recipes.id, printJobs.recipeId))
    .where(isNull(printJobs.deletedAt))
    .orderBy(desc(printJobs.startedAt))
    .limit(40);
  const ids: number[] = [];
  for (const r of rows) {
    const id = current.find((c) => c.recipeGroup === r.group)?.id;
    if (id != null && !ids.includes(id)) ids.push(id);
    if (ids.length === 5) break;
  }
  return ids;
}

export type StartInput = {
  recipeId: number;
  machineId: number;
  filamentId: number;
  secondFilamentId: number | null;
  /** With two filaments (a manual colour change): grams of the first; the second gets the rest (D10). */
  firstFilamentGrams: number | null;
};

/** D33/D34: Start inserts the job with no finished_at and snapshots today's inputs (rule 4). */
export async function startJob(db: Db, input: StartInput, now = new Date()): Promise<number> {
  return db.transaction((tx) => startJobIn(tx, input, now));
}

/** Start inside the caller's transaction (Start-from-file saves the recipe in the same one). */
export async function startJobIn(tx: Tx, input: StartInput, now = new Date()): Promise<number> {
  {
    const [r] = await tx
      .select()
      .from(recipes)
      .where(and(eq(recipes.id, input.recipeId), isNull(recipes.deletedAt)));
    if (!r) throw new PrintError("That recipe no longer exists.");
    if (!r.isCurrent) throw new PrintError("That's an old recipe version. Choose the current one.");
    const [m] = await tx
      .select()
      .from(machines)
      .where(and(eq(machines.id, input.machineId), isNull(machines.deletedAt)));
    if (!m || m.type !== "printer" || m.status !== "active") throw new PrintError("Choose an active printer.");
    const [running] = await tx
      .select({ id: printJobs.id })
      .from(printJobs)
      .where(and(eq(printJobs.machineId, m.id), isNull(printJobs.finishedAt), isNull(printJobs.deletedAt)));
    if (running) throw new PrintError(`${m.name} is busy. Finish its current print first.`);

    const items = await tx
      .select()
      .from(recipeItems)
      .where(and(eq(recipeItems.recipeId, r.id), isNull(recipeItems.deletedAt)))
      .orderBy(asc(recipeItems.id));
    if (items.length === 0) throw new PrintError("That recipe has no items.");
    const plateGrams = r.gramsOverride ?? r.totalGrams;
    if (plateGrams == null) throw new PrintError("That recipe has no grams. Set actual grams on the recipe.");

    const split: { filamentId: number; grams: number }[] = [{ filamentId: input.filamentId, grams: plateGrams }];
    if (input.secondFilamentId != null) {
      if (input.secondFilamentId === input.filamentId) throw new PrintError("Choose two different filaments.");
      const first = input.firstFilamentGrams;
      if (first == null || first <= 0 || first >= plateGrams)
        throw new PrintError(`Enter the first filament's grams, between 0 and ${plateGrams} g.`);
      split[0]!.grams = first;
      split.push({ filamentId: input.secondFilamentId, grams: plateGrams - first });
    }
    for (const s of split) {
      const [f] = await tx
        .select({ type: stockItems.type })
        .from(stockItems)
        .where(and(eq(stockItems.id, s.filamentId), isNull(stockItems.deletedAt)));
      if (f?.type !== "filament") throw new PrintError("Choose a filament.");
    }

    const live = await liveInputs(tx);
    const totalPieces = items.reduce((t, i) => t + i.qtyOnPlate, 0);
    const [job] = await tx
      .insert(printJobs)
      .values({
        recipeId: r.id,
        machineId: m.id,
        startedAt: now,
        estimatedSeconds: r.estimatedSeconds,
        electricityKwhPriceUsd: live.kwhPriceUsd,
        printerPowerKw: m.avgPowerKw,
        machineCostPerHourUsd: machineCost(m),
        failureMethod: live.method,
        failureAllowancePct: r.wasteAllowancePctOverride ?? live.allowancePct,
        recipeOverrides: {
          gramsOverride: r.gramsOverride,
          wasteAllowancePctOverride: r.wasteAllowancePctOverride,
          labourMinutes: r.labourMinutes,
        },
      })
      .returning({ id: printJobs.id })
      .catch((e: unknown) => {
        // F-03: the partial unique index is the last line of defence against a double Start.
        if ((e as { cause?: { code?: string } }).cause?.code === "23505")
          throw new PrintError(`${m.name} is busy. Finish its current print first.`);
        throw e;
      });
    await tx.insert(printJobItems).values(
      items.map((i) => ({
        printJobId: job!.id,
        productId: i.productId,
        qtyPlanned: i.qtyOnPlate,
        gramsPerPiece: i.gramsPerPiece,
        labourMinutesPerUnit: labourMinutesPerPiece(r.labourMinutes, totalPieces),
      })),
    );
    for (const s of split) {
      await tx.insert(printJobFilaments).values({
        printJobId: job!.id,
        filamentId: s.filamentId,
        gramsUsed: s.grams,
        gramsSource: r.gramsOverride != null ? "override" : "recipe_estimate",
        costPerGramUsd: await currentAverage(tx, s.filamentId),
      });
    }
    return job!.id;
  }
}

/**
 * Start from a .gcode file (Joe, Nov 26): the file becomes a recipe (or a new version of one)
 * only if the print starts. Both happen in one transaction, so a refused Start saves nothing.
 */
export async function startJobFromFile(
  db: Db,
  input: { recipe: ImportInput; start: Omit<StartInput, "recipeId"> },
  now = new Date(),
): Promise<{ jobId: number; recipeId: number }> {
  const prepared = await prepareImport(db, input.recipe);
  return db.transaction(async (tx) => {
    const r = await saveImport(tx, prepared);
    const jobId = await startJobIn(tx, { ...input.start, recipeId: r.id }, now);
    return { jobId, recipeId: r.id };
  });
}

export async function getJob(db: Db | Tx, id: number) {
  const [row] = await db
    .select({ job: printJobs, recipe: recipes, machine: machines })
    .from(printJobs)
    .innerJoin(recipes, eq(recipes.id, printJobs.recipeId))
    .innerJoin(machines, eq(machines.id, printJobs.machineId))
    .where(and(eq(printJobs.id, id), isNull(printJobs.deletedAt)));
  if (!row) return null;
  const [items, filaments] = await Promise.all([
    db
      .select({
        line: printJobItems,
        productName: products.name,
        productVariant: products.variant,
        productKind: products.kind,
      })
      .from(printJobItems)
      .innerJoin(products, eq(products.id, printJobItems.productId))
      .where(and(eq(printJobItems.printJobId, id), isNull(printJobItems.deletedAt)))
      .orderBy(asc(printJobItems.id)),
    db
      .select({ line: printJobFilaments, name: stockItems.name, emptySpoolWeightG: stockItems.emptySpoolWeightG })
      .from(printJobFilaments)
      .innerJoin(stockItems, eq(stockItems.id, printJobFilaments.filamentId))
      .where(and(eq(printJobFilaments.printJobId, id), isNull(printJobFilaments.deletedAt)))
      .orderBy(asc(printJobFilaments.id)),
  ]);
  return { ...row.job, recipe: row.recipe, machine: row.machine, items, filaments };
}

export type Job = NonNullable<Awaited<ReturnType<typeof getJob>>>;

/** Planned grams per filament line, before stopped-at % (what Start put in grams_used). */
function plannedGrams(job: Job, lineId: number): number {
  const plate = (job.recipeOverrides?.gramsOverride as number | null | undefined) ?? job.recipe.totalGrams ?? 0;
  if (job.filaments.length === 1) return plate;
  // Two filaments: Start stored each line's planned share; once finished, recover it from the snapshot ratio.
  const line = job.filaments.find((f) => f.line.id === lineId)!;
  if (!job.finishedAt) return line.line.gramsUsed;
  const stored = (job.recipeOverrides?.plannedSplit as Record<string, number> | undefined)?.[String(lineId)];
  return stored ?? line.line.gramsUsed;
}

export function jobForFinish(job: Job): JobForFinish {
  return {
    kwhPriceUsd: job.electricityKwhPriceUsd,
    powerKw: job.printerPowerKw,
    machineCostPerHourUsd: job.machineCostPerHourUsd,
    method: job.failureMethod ?? "allowance",
    allowancePct: job.failureAllowancePct ?? 12,
    filaments: job.filaments.map((f) => ({
      id: f.line.id,
      plannedGrams: plannedGrams(job, f.line.id),
      costPerGramUsd: f.line.costPerGramUsd,
      fromOverride: job.recipeOverrides?.gramsOverride != null,
    })),
    items: job.items.map((i) => ({
      id: i.line.id,
      qtyPlanned: i.line.qtyPlanned,
      gramsPerPiece: i.line.gramsPerPiece,
    })),
  };
}

export type FinishFormInput = {
  hours: number;
  hoursSource: "gcode_estimate" | "confirmed" | "entered";
  stoppedAtPct: number;
  powerCut: boolean;
  failureReason: string | null;
  good: Record<number, number>;
  weighed: Record<number, number | null>;
};

/** Finished stock item for a product or part, created on first use. */
async function productStockItem(tx: Tx, productId: number): Promise<number> {
  const [existing] = await tx
    .select({ id: stockItems.id })
    .from(stockItems)
    .where(and(eq(stockItems.productId, productId), isNull(stockItems.deletedAt)));
  if (existing) return existing.id;
  const [p] = await tx.select().from(products).where(eq(products.id, productId));
  const [row] = await tx
    .insert(stockItems)
    .values({
      name: p!.variant ? `${p!.name} (${p!.variant})` : p!.name,
      type: p!.kind === "part" ? "printed_part" : "finished_product",
      unit: "pieces",
      productId,
    })
    .returning({ id: stockItems.id });
  return row!.id;
}

/**
 * Finish (D20, D23, D33): completes the job once, fills any input that was missing at Start from
 * today's values, then writes one −movement per filament and one +movement per item with good pieces.
 * Refuses to save while cost inputs are still missing, naming each one.
 */
export async function finishJob(db: Db, jobId: number, input: FinishFormInput, now = new Date()) {
  return db.transaction(async (tx) => {
    await tx.select({ id: printJobs.id }).from(printJobs).where(eq(printJobs.id, jobId)).for("update");
    let job = await getJob(tx, jobId);
    if (!job) throw new PrintError("That print no longer exists.");
    if (job.finishedAt) throw new PrintError("This print is already finished. Edit it instead.");

    // Fill gaps left at Start (e.g. electricity price set afterwards). Known snapshots are never changed.
    const live = await liveInputs(tx);
    const fill: Partial<typeof printJobs.$inferInsert> = {};
    if (job.electricityKwhPriceUsd == null && live.kwhPriceUsd != null) fill.electricityKwhPriceUsd = live.kwhPriceUsd;
    if (job.printerPowerKw == null && job.machine.avgPowerKw != null) fill.printerPowerKw = job.machine.avgPowerKw;
    if (job.machineCostPerHourUsd == null && machineCost(job.machine) != null)
      fill.machineCostPerHourUsd = machineCost(job.machine);
    if (Object.keys(fill).length) await tx.update(printJobs).set(fill).where(eq(printJobs.id, jobId));
    for (const f of job.filaments) {
      if (f.line.costPerGramUsd != null) continue;
      const avg = await currentAverage(tx, f.line.filamentId);
      if (avg != null)
        await tx.update(printJobFilaments).set({ costPerGramUsd: avg }).where(eq(printJobFilaments.id, f.line.id));
    }
    job = (await getJob(tx, jobId))!;

    const planned = jobForFinish(job);
    const result = computeFinish(planned, input);
    if (!result.complete)
      throw new PrintError(`Cost can't be worked out yet. Add ${missingText(result.missing)}.`, result.missing);

    await tx
      .update(printJobs)
      .set({
        finishedAt: now,
        hours: input.hours,
        hoursSource: input.hoursSource,
        stoppedAtPct: input.stoppedAtPct,
        powerCut: input.powerCut,
        failureReason: input.failureReason,
        jobCostUsd: result.total,
        wasteCostUsd: result.wasteTotal,
        updatedAt: now,
        recipeOverrides: {
          ...job.recipeOverrides,
          plannedSplit: Object.fromEntries(planned.filaments.map((f) => [String(f.id), f.plannedGrams])),
        },
      })
      .where(eq(printJobs.id, jobId));
    await writeLines(tx, job, result, now);
    return result;
  });
}

async function writeLines(tx: Tx, job: Job, result: Extract<FinishResult, { complete: true }>, at: Date) {
  for (const f of result.filaments) {
    const line = job.filaments.find((l) => l.line.id === f.id)!;
    await tx
      .update(printJobFilaments)
      .set({ gramsUsed: f.grams, gramsSource: f.source, weighedGrams: f.weighedGrams, updatedAt: at })
      .where(eq(printJobFilaments.id, f.id));
    if (f.grams > 0)
      await recordMovement(tx, {
        stockItemId: line.line.filamentId,
        amount: -f.grams,
        reason: "print",
        movedAt: at,
        printJobId: job.id,
        printJobFilamentId: f.id,
      });
  }
  for (const it of result.items) {
    const line = job.items.find((l) => l.line.id === it.id)!;
    await tx
      .update(printJobItems)
      .set({
        qtyGood: it.good,
        gramsShare: it.gramsShare,
        costShareUsd: it.costShare,
        unitCostUsd: it.unitCost,
        wasteCostUsd: it.wasteCost,
        updatedAt: at,
      })
      .where(eq(printJobItems.id, it.id));
    if (it.good > 0 && it.unitCost != null)
      await recordMovement(tx, {
        stockItemId: await productStockItem(tx, line.line.productId),
        amount: it.good,
        reason: "print",
        movedAt: at,
        printJobId: job.id,
        printJobItemId: it.id,
        unitCostUsd: it.unitCost,
        labourMinutesPerUnit: line.line.labourMinutesPerUnit,
      });
  }
}

/**
 * D13 edit of a finished print: same snapshots, recomputed lines, every changed field logged,
 * linked stock movements updated in the same transaction and averages replayed (plan §3.10).
 */
export async function editFinishedJob(db: Db, jobId: number, input: FinishFormInput, userId?: number) {
  return db.transaction(async (tx) => {
    const job = await getJob(tx, jobId);
    if (!job) throw new PrintError("That print no longer exists.");
    if (!job.finishedAt) throw new PrintError("This print isn't finished yet.");
    const result = computeFinish(jobForFinish(job), input);
    if (!result.complete) throw new PrintError(`Cost can't be worked out. Add ${missingText(result.missing)}.`);
    const log = { userId };
    await updateLogged(
      tx,
      printJobs,
      jobId,
      {
        hours: input.hours,
        hoursSource: input.hoursSource,
        stoppedAtPct: input.stoppedAtPct,
        powerCut: input.powerCut,
        failureReason: input.failureReason,
        jobCostUsd: result.total,
        wasteCostUsd: result.wasteTotal,
      },
      log,
    );
    const touched = new Set<number>();
    for (const f of result.filaments) {
      const line = job.filaments.find((l) => l.line.id === f.id)!;
      await updateLogged(
        tx,
        printJobFilaments,
        f.id,
        { gramsUsed: f.grams, gramsSource: f.source, weighedGrams: f.weighedGrams },
        log,
      );
      await syncMovement(tx, { printJobFilamentId: f.id }, line.line.filamentId, -f.grams, null, null, job, log);
      touched.add(line.line.filamentId);
    }
    for (const it of result.items) {
      const line = job.items.find((l) => l.line.id === it.id)!;
      await updateLogged(
        tx,
        printJobItems,
        it.id,
        {
          qtyGood: it.good,
          gramsShare: it.gramsShare,
          costShareUsd: it.costShare,
          unitCostUsd: it.unitCost,
          wasteCostUsd: it.wasteCost,
        },
        log,
      );
      const stockId = await productStockItem(tx, line.line.productId);
      await syncMovement(
        tx,
        { printJobItemId: it.id },
        stockId,
        it.unitCost == null ? 0 : it.good,
        it.unitCost,
        line.line.labourMinutesPerUnit,
        job,
        log,
      );
      touched.add(stockId);
    }
    for (const id of touched) await replayAverages(tx, id);
    return result;
  });
}

async function syncMovement(
  tx: Tx,
  link: { printJobFilamentId: number } | { printJobItemId: number },
  stockItemId: number,
  amount: number,
  unitCostUsd: number | null,
  labourMinutesPerUnit: number | null,
  job: Job,
  log: { userId?: number },
) {
  const where =
    "printJobFilamentId" in link
      ? eq(stockMovements.printJobFilamentId, link.printJobFilamentId)
      : eq(stockMovements.printJobItemId, link.printJobItemId);
  const [m] = await tx
    .select()
    .from(stockMovements)
    .where(and(where, isNull(stockMovements.deletedAt)));
  if (m && amount === 0) await softDeleteLogged(tx, stockMovements, m.id, log);
  else if (m) await updateLogged(tx, stockMovements, m.id, { amount, unitCostUsd }, log);
  else if (amount !== 0)
    await tx.insert(stockMovements).values({
      stockItemId,
      amount,
      reason: "print",
      movedAt: job.finishedAt!,
      printJobId: job.id,
      ...link,
      unitCostUsd,
      labourMinutesPerUnit,
    });
}

/**
 * Weigh filament (D23): scale readings of every open spool of one filament, minus the empty
 * spool weight each, compared with stock. The difference is one weigh-in adjustment + one movement.
 */
export async function weighFilament(
  db: Db,
  i: { filamentId: number; readings: number[]; emptySpoolG: number; reason: string | null },
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const [f] = await tx
      .select()
      .from(stockItems)
      .where(and(eq(stockItems.id, i.filamentId), isNull(stockItems.deletedAt)));
    if (f?.type !== "filament") throw new PrintError("Choose a filament.");
    const measured = i.readings.reduce((s, r) => s + Math.max(0, r - i.emptySpoolG), 0);
    const expected = await onHand(tx, f.id);
    const difference = measured - expected;
    const [adj] = await tx
      .insert(adjustments)
      .values({
        type: "weigh_in",
        stockItemId: f.id,
        expected,
        measured,
        spoolsWeighed: i.readings.length,
        difference,
        reason: i.reason,
      })
      .returning();
    if (Math.abs(difference) > 1e-9)
      await recordMovement(tx, {
        stockItemId: f.id,
        amount: difference,
        reason: "weigh_in",
        movedAt: now,
        adjustmentId: adj!.id,
      });
    if (f.emptySpoolWeightG !== i.emptySpoolG)
      await tx.update(stockItems).set({ emptySpoolWeightG: i.emptySpoolG }).where(eq(stockItems.id, f.id));
    return adj!;
  });
}
