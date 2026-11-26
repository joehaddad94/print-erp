"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { f, failure, formValues, validate, type FormState } from "@/server/form";
import { importSchema } from "@/server/recipes/schema";
import { ImportError } from "@/server/recipes/service";
import {
  editFinishedJob,
  finishJob,
  PrintError,
  startJob,
  startJobFromFile,
  weighFilament,
  type FinishFormInput,
} from "./service";

function refresh() {
  for (const p of ["/", "/print", "/stock", "/machines", "/weigh", "/recipes", "/products"]) revalidatePath(p);
}

const startSchema = z.object({
  recipeId: f.id("a recipe"),
  machineId: f.id("a printer"),
  filamentId: f.id("a filament"),
  secondFilamentId: f.optionalId(),
  firstFilamentGrams: f.optionalNumber("the first filament's grams", { positive: true }),
});

/**
 * Start print. With a `recipeImport` field (JSON, sent after the browser uploaded a .gcode),
 * the file is saved as a recipe and the print started together (Nov 26).
 */
export async function startPrintAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const { recipeImport, ...values } = formValues(fd);
  try {
    if (recipeImport) {
      const v = validate(startSchema.omit({ recipeId: true }), values);
      if (!v.ok) return v.state;
      let json: unknown;
      try {
        json = JSON.parse(recipeImport);
      } catch {
        return failure(values, "Choose the file again.");
      }
      const recipe = importSchema.safeParse(json);
      if (!recipe.success) return failure(values, recipe.error.issues[0]?.message ?? "Check the items on the plate.");
      await startJobFromFile(db(), { recipe: recipe.data, start: v.data });
    } else {
      const v = validate(startSchema, values);
      if (!v.ok) return v.state;
      await startJob(db(), v.data);
    }
  } catch (e) {
    return failure(
      values,
      e instanceof PrintError || e instanceof ImportError ? e.message : "Couldn't start. Nothing was saved. Try again.",
    );
  }
  refresh();
  redirect("/");
}

const finishSchema = z.object({
  hours: f.number("the print time", { positive: true }),
  hoursSource: z.enum(["gcode_estimate", "confirmed", "entered"]),
  stoppedAtPct: f.number("how far it got", { min: 1, max: 100 }),
  powerCut: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  failureReason: f.optionalText(500),
});

/** Good pieces (good-<itemId>) and weighed grams (weighed-<lineId>) are dynamic per plate. */
function parseFinish(
  values: Record<string, string>,
): { ok: true; data: FinishFormInput } | { ok: false; state: FormState } {
  const v = validate(finishSchema, values);
  const fieldErrors: Record<string, string> = v.ok ? {} : { ...v.state.fieldErrors };
  const good: Record<number, number> = {};
  const weighed: Record<number, number | null> = {};
  for (const [k, raw] of Object.entries(values)) {
    const text = raw.replace(/,/g, "").trim();
    if (k.startsWith("good-")) {
      const n = Number(text);
      if (text === "" || !Number.isInteger(n) || n < 0) fieldErrors[k] = "Enter a whole number, 0 or more";
      else good[Number(k.slice(5))] = n;
    }
    if (k.startsWith("weighed-")) {
      if (text === "") weighed[Number(k.slice(8))] = null;
      else if (!(Number(text) >= 0)) fieldErrors[k] = "Enter grams as a number";
      else weighed[Number(k.slice(8))] = Number(text);
    }
  }
  if (!v.ok || Object.keys(fieldErrors).length)
    return { ok: false, state: { fieldErrors, values, version: Date.now() } };
  return { ok: true, data: { ...v.data, good, weighed } };
}

export async function finishPrintAction(id: number, _prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const values = formValues(fd);
  const p = parseFinish(values);
  if (!p.ok) return p.state;
  try {
    await finishJob(db(), id, p.data);
  } catch (e) {
    return failure(values, e instanceof PrintError ? e.message : "Couldn't save. Nothing was recorded. Try again.");
  }
  refresh();
  redirect(`/print/${id}`);
}

export async function editPrintAction(id: number, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(fd);
  const p = parseFinish(values);
  if (!p.ok) return p.state;
  try {
    await editFinishedJob(db(), id, p.data, user.id);
  } catch (e) {
    return failure(values, e instanceof PrintError ? e.message : "Couldn't save. Nothing was changed. Try again.");
  }
  refresh();
  redirect(`/print/${id}`);
}

export async function weighAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const values = formValues(fd);
  const v = validate(
    z.object({
      filamentId: f.id("a filament"),
      emptySpoolG: f.number("the empty spool weight", { min: 0 }),
      reason: f.optionalText(300),
    }),
    values,
  );
  const readings: number[] = [];
  const fieldErrors: Record<string, string> = v.ok ? {} : { ...v.state.fieldErrors };
  for (const [k, raw] of Object.entries(values)) {
    if (!k.startsWith("reading-") || raw.trim() === "") continue;
    const n = Number(raw.replace(/,/g, ""));
    if (!(n > 0)) fieldErrors[k] = "Enter the scale reading in grams";
    else readings.push(n);
  }
  if (readings.length === 0 && !fieldErrors["reading-0"]) fieldErrors["reading-0"] = "Enter at least one spool";
  if (!v.ok || Object.keys(fieldErrors).length) return { fieldErrors, values, version: Date.now() };
  try {
    const adj = await weighFilament(db(), { ...v.data, readings });
    refresh();
    const d = Number(adj.difference.toFixed(1));
    return {
      ok: true,
      message: `Saved. Measured ${Number(adj.measured.toFixed(1))} g; stock ${d === 0 ? "was right" : `corrected by ${d > 0 ? "+" : ""}${d} g`}.`,
      version: Date.now(),
    };
  } catch (e) {
    return failure(values, e instanceof PrintError ? e.message : "Couldn't save. Nothing was recorded. Try again.");
  }
}
