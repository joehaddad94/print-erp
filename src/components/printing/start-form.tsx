"use client";

import { Link } from "@/components/ui/link";
import { useState } from "react";
import { ActionForm } from "@/components/form/action-form";
import { NumberField, SelectField } from "@/components/form/fields";
import { Callout, Field } from "@/components/ui";
import { jobCost, unitCost, type MissingInput } from "@/lib/cost";
import { formatDuration } from "@/lib/format";
import { printerModelsMatch } from "@/lib/gcode";
import { formatMoney } from "@/lib/money";
import { startPrintAction } from "@/server/printing/actions";
import type { startOptions } from "@/server/printing/service";

type Options = Awaited<ReturnType<typeof startOptions>>;
const usd = (n: number) => formatMoney(n, "USD");

/** D16: warn when the file was sliced for another printer or nozzle. */
function mismatch(r: Options["recipes"][number], p: Options["printers"][number]): string[] {
  const out: string[] = [];
  if (r.printerModel && p.model && !printerModelsMatch(r.printerModel, p.model))
    out.push(`The file was sliced for ${r.printerModel}, not ${p.model}.`);
  if (r.nozzleMm != null && p.nozzleMm != null && Math.abs(r.nozzleMm - p.nozzleMm) > 1e-6)
    out.push(`The file uses a ${r.nozzleMm} mm nozzle; ${p.name} has ${p.nozzleMm} mm.`);
  return out;
}

export function StartForm({ options }: { options: Options }) {
  const free = options.printers.filter((p) => !p.busy);
  const [recipeId, setRecipeId] = useState("");
  const [printerId, setPrinterId] = useState(free.length === 1 ? String(free[0]!.id) : "");
  const [filamentId, setFilamentId] = useState("");
  const [secondId, setSecondId] = useState("");

  const recipe = options.recipes.find((r) => String(r.id) === recipeId);
  const printer = free.find((p) => String(p.id) === printerId);
  const autoFilament =
    filamentId ||
    String(
      options.filaments.find((f) => recipe?.material && f.material?.toLowerCase() === recipe.material.toLowerCase())
        ?.id ??
        options.filaments[0]?.id ??
        "",
    );
  const filament = options.filaments.find((f) => String(f.id) === autoFilament);

  const estimate =
    recipe && printer && filament && recipe.estimatedSeconds
      ? jobCost({
          filaments: [{ grams: recipe.plateGrams, costPerGramUsd: filament.costPerGramUsd }],
          hours: recipe.estimatedSeconds / 3600,
          powerKw: printer.powerKw,
          kwhPriceUsd: options.kwhPriceUsd,
          machineCostPerHourUsd: printer.costPerHourUsd,
        })
      : null;
  const allowance = recipe?.allowancePct ?? options.allowancePct;

  return (
    <div className="flex flex-col gap-4">
      {options.printers
        .filter((p) => p.busy)
        .map((p) => (
          <Callout key={p.id} tone="warning" title={`Busy: ${p.busy!.recipeName}`}>
            {p.name}, started{" "}
            {new Date(p.busy!.startedAt).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Beirut",
            })}
            .{" "}
            <Link
              className="inline-flex min-h-tap items-center font-semibold underline"
              href={`/print/${p.busy!.jobId}`}
            >
              Finish this print
            </Link>
          </Callout>
        ))}
      {free.length === 0 ? null : (
        <ActionForm
          action={startPrintAction}
          submitLabel="Start print"
          defaults={{ machineId: printerId, filamentId: autoFilament }}
        >
          <SelectField
            name="recipeId"
            label="Recipe"
            placeholder="Choose…"
            options={options.recipes.map((r) => ({ value: String(r.id), label: `${r.name} · v${r.version}` }))}
            onValueChange={setRecipeId}
          />
          <SelectField
            name="machineId"
            label="Printer"
            placeholder={free.length === 1 ? undefined : "Choose…"}
            options={free.map((p) => ({ value: String(p.id), label: p.name }))}
            onValueChange={setPrinterId}
          />
          <input type="hidden" name="filamentId" value={autoFilament} />
          <Field id="filament-pick" label="Filament">
            <select
              id="filament-pick"
              value={autoFilament}
              onChange={(e) => setFilamentId(e.target.value)}
              className="control px-3 text-md text-ink"
            >
              {options.filaments.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({Math.round(f.onHand)} g left)
                </option>
              ))}
            </select>
          </Field>
          <SelectField
            name="secondFilamentId"
            label="Second filament (colour change)"
            placeholder="None"
            options={options.filaments
              .filter((f) => String(f.id) !== autoFilament)
              .map((f) => ({ value: String(f.id), label: f.name }))}
            onValueChange={setSecondId}
          />
          {secondId ? (
            <NumberField
              name="firstFilamentGrams"
              label="Grams of the first filament"
              suffix="g"
              hint={recipe ? `The second gets the rest of ${Number(recipe.plateGrams.toFixed(2))} g.` : undefined}
            />
          ) : null}

          {recipe && printer
            ? mismatch(recipe, printer).map((m) => (
                <Callout key={m} tone="warning">
                  {m}
                </Callout>
              ))
            : null}

          {recipe ? (
            <div className="rounded-md bg-bg px-3 py-2.5 text-sm" aria-live="polite">
              <p className="font-semibold">
                {Number(recipe.plateGrams.toFixed(2))} g · {formatDuration(recipe.estimatedSeconds)} ·{" "}
                {recipe.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}
              </p>
              {estimate?.complete ? (
                <p>
                  Estimated cost {usd(estimate.total)}
                  {recipe.items.length === 1
                    ? ` · ${usd(
                        unitCost({
                          share: estimate.total,
                          planned: recipe.items[0]!.qty,
                          good: recipe.items[0]!.qty,
                          method: options.method,
                          allowancePct: allowance,
                        })!,
                      )} per piece`
                    : ""}
                </p>
              ) : estimate ? (
                <MissingList missing={estimate.missing} printerId={printer?.id} />
              ) : null}
            </div>
          ) : null}
        </ActionForm>
      )}
    </div>
  );
}

function MissingList({ missing, printerId }: { missing: MissingInput[]; printerId?: number }) {
  const map: Record<MissingInput, [string, string]> = {
    electricity_price: ["Set the electricity price", "/settings"],
    machine_power: ["Set the printer's power", `/machines/${printerId ?? ""}`],
    machine_cost: ["Set the printer's purchase cost", `/machines/${printerId ?? ""}`],
    filament_cost: ["Add a purchase of this filament", "/expenses/new"],
  };
  return (
    <div>
      <p className="font-semibold">Cost incomplete. You can still start; add these before Finish:</p>
      <ul className="list-disc pl-5">
        {missing.map((m) => (
          <li key={m}>
            <Link className="inline-flex min-h-tap items-center font-semibold underline" href={map[m][1]}>
              {map[m][0]}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
