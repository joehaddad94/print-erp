"use client";

import { Link } from "@/components/ui/link";
import { useId, useRef, useState } from "react";
import { ActionForm, useFieldState } from "@/components/form/action-form";
import { NumberField, SelectField } from "@/components/form/fields";
import { uploadGcode } from "@/components/recipes/gcode-client";
import { ImportDetails } from "@/components/recipes/import-details";
import { num, useGcodeImport, type ProductOption, type RecipeGroup } from "@/components/recipes/use-gcode-import";
import { Button, Callout, Field } from "@/components/ui";
import { jobCost, unitCost, type MissingInput } from "@/lib/cost";
import { formatDuration } from "@/lib/format";
import { printerModelsMatch, SUPPORTED_SLICERS, type ParsedGcode } from "@/lib/gcode";
import { formatMoney } from "@/lib/money";
import { startPrintAction } from "@/server/printing/actions";
import type { FormState } from "@/server/form";
import type { startOptions } from "@/server/printing/service";
import type { BlobUploadFlavor, StorageMode } from "@/server/storage";

type Options = Awaited<ReturnType<typeof startOptions>>;
type RecipeView = Pick<
  Options["recipes"][number],
  "plateGrams" | "estimatedSeconds" | "material" | "printerModel" | "nozzleMm" | "allowancePct"
> & { items: { name: string; qty: number }[] };

/** What Start needs to read a file and upload it (same as Import). */
export type FileOptions = {
  /** False on Vercel without a Blob store: the file can't be kept, so only saved recipes work. */
  available: boolean;
  mode: StorageMode;
  access: "private" | "public";
  flavor: BlobUploadFlavor;
  products: ProductOption[];
  tolerance: { grams: number; pct: number };
};
const usd = (n: number) => formatMoney(n, "USD");

/** D16: warn when the file was sliced for another printer or nozzle. */
function mismatch(r: RecipeView, p: Options["printers"][number]): string[] {
  const out: string[] = [];
  if (r.printerModel && p.model && !printerModelsMatch(r.printerModel, p.model))
    out.push(`The file was sliced for ${r.printerModel}, not ${p.model}.`);
  if (r.nozzleMm != null && p.nozzleMm != null && Math.abs(r.nozzleMm - p.nozzleMm) > 1e-6)
    out.push(`The file uses a ${r.nozzleMm} mm nozzle; ${p.name} has ${p.nozzleMm} mm.`);
  return out;
}

/** Saved recipes as groups a new file can version, with their items' object names (Nov 26). */
function groupsOf(recipes: Options["recipes"]): RecipeGroup[] {
  return recipes.map((r) => ({
    recipeGroup: r.recipeGroup,
    name: r.name,
    items: r.items.map((i) => ({ objectName: i.objectName, productId: i.productId })),
  }));
}

/** Joe, Nov 26: a re-slice keeps the STL names, so a recipe holding every object of the file is suggested. */
function suggestGroup(groups: RecipeGroup[], parsed: ParsedGcode): RecipeGroup | undefined {
  const names = parsed.objects.map((o) => o.rawName).filter(Boolean);
  if (names.length === 0) return undefined;
  return groups.find((g) => names.every((n) => g.items.some((i) => i.objectName === n)));
}

/** Joe, Nov 26: for a new file, pick a filament only when exactly one in stock has its material. */
function onlyMatch(filaments: Options["filaments"], material: string | null | undefined): string {
  if (!material) return "";
  const m = filaments.filter((f) => f.onHand > 0 && f.material?.toLowerCase() === material.toLowerCase());
  return m.length === 1 ? String(m[0]!.id) : "";
}

export function StartForm({ options, file: fileOpts }: { options: Options; file: FileOptions }) {
  const free = options.printers.filter((p) => !p.busy);
  const fileId = useId();
  const groups = groupsOf(options.recipes);
  const [source, setSource] = useState<"recipe" | "file">(options.recipes.length ? "recipe" : "file");
  const [recipeId, setRecipeId] = useState("");
  const [printerId, setPrinterId] = useState(free.length === 1 ? String(free[0]!.id) : "");
  const [filamentId, setFilamentId] = useState("");
  const [secondId, setSecondId] = useState("");
  const imp = useGcodeImport({ tolerance: fileOpts.tolerance, onParsed: (p) => suggestGroup(groups, p) });
  /** The file already uploaded by a Start that was then refused, so a retry doesn't upload it again. */
  const uploaded = useRef<{ file: File; url: string } | null>(null);

  // Joe, Nov 26: the identical file already saved → Start uses that recipe.
  const dupRecipe = imp.duplicate ? options.recipes.find((r) => r.id === imp.duplicate!.id) : undefined;
  const fromFile = source === "file" && !!imp.parsed && !imp.duplicate;
  const savedRecipe =
    source === "recipe"
      ? options.recipes.find((r) => String(r.id) === recipeId)
      : source === "file"
        ? dupRecipe
        : undefined;
  const fileMinutes = imp.timeEstimated ? num(imp.minutes) : null;
  const recipe: RecipeView | undefined = fromFile
    ? {
        plateGrams: imp.plateGrams > 0 ? imp.plateGrams : 0,
        estimatedSeconds: fileMinutes != null ? fileMinutes * 60 : imp.parsed!.estimatedSeconds,
        material: imp.parsed!.material,
        printerModel: imp.parsed!.printerModel,
        nozzleMm: imp.parsed!.nozzleMm,
        allowancePct: null,
        items: imp.rows.map((r) => ({
          name:
            (r.productId ? fileOpts.products.find((p) => String(p.id) === r.productId)?.label : r.newName) || r.label,
          qty: num(r.qty) || 0,
        })),
      }
    : savedRecipe;
  const printer = free.find((p) => String(p.id) === printerId);
  const autoFilament =
    filamentId ||
    (fromFile
      ? onlyMatch(options.filaments, recipe?.material)
      : String(
          options.filaments.find((f) => recipe?.material && f.material?.toLowerCase() === recipe.material.toLowerCase())
            ?.id ??
            options.filaments[0]?.id ??
            "",
        ));
  const filament = options.filaments.find((f) => String(f.id) === autoFilament);

  const estimate =
    recipe && printer && filament && recipe.estimatedSeconds && recipe.plateGrams > 0
      ? jobCost({
          filaments: [{ grams: recipe.plateGrams, costPerGramUsd: filament.costPerGramUsd }],
          hours: recipe.estimatedSeconds / 3600,
          powerKw: printer.powerKw,
          kwhPriceUsd: options.kwhPriceUsd,
          machineCostPerHourUsd: printer.costPerHourUsd,
        })
      : null;
  const allowance = recipe?.allowancePct ?? options.allowancePct;

  /** File mode: upload the new file first, then Start saves it as a recipe and starts in one go. */
  async function start(prev: FormState, fd: FormData): Promise<FormState> {
    if (source === "file") {
      const values = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<
        string,
        string
      >;
      if (!imp.parsed) return { error: "Choose a .gcode file.", values, version: Date.now() };
      if (!imp.duplicate) {
        if (!imp.ready)
          return { error: "Finish the recipe details and the items on the plate first.", values, version: Date.now() };
        try {
          const file = imp.file!;
          if (uploaded.current?.file !== file)
            uploaded.current = {
              file,
              url: await uploadGcode(file, fileOpts.mode, fileOpts.access, fileOpts.flavor),
            };
          fd.set("recipeImport", JSON.stringify(imp.payload(uploaded.current.url)));
        } catch {
          return {
            error: "The upload failed. Nothing was saved. Check your connection and try again.",
            values,
            version: Date.now(),
          };
        }
      } else if (!dupRecipe)
        return {
          error: `This file is ${imp.duplicate.name} v${imp.duplicate.version}, an older version. Choose the current version under Saved recipe.`,
          values,
          version: Date.now(),
        };
    }
    return startPrintAction(prev, fd);
  }

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
              className="inline-flex min-h-control items-center font-semibold underline"
              href={`/print/${p.busy!.jobId}`}
            >
              Finish this print
            </Link>
          </Callout>
        ))}
      {free.length === 0 ? null : (
        <ActionForm
          action={start}
          submitLabel={fromFile ? "Save recipe and start print" : "Start print"}
          defaults={{ machineId: printerId, filamentId: autoFilament }}
        >
          <Field id={`${fileId}-source`} label="Print from">
            <div id={`${fileId}-source`} role="group" className="grid grid-cols-2 gap-2">
              <Button
                variant={source === "recipe" ? "primary" : "secondary"}
                aria-pressed={source === "recipe"}
                disabled={options.recipes.length === 0}
                onClick={() => setSource("recipe")}
              >
                Saved recipe
              </Button>
              <Button
                variant={source === "file" ? "primary" : "secondary"}
                aria-pressed={source === "file"}
                onClick={() => setSource("file")}
              >
                .gcode file
              </Button>
            </div>
          </Field>

          {source === "recipe" ? (
            <SelectField
              name="recipeId"
              label="Recipe"
              placeholder="Choose…"
              options={options.recipes.map((r) => ({ value: String(r.id), label: `${r.name} · v${r.version}` }))}
              onValueChange={setRecipeId}
            />
          ) : !fileOpts.available ? (
            <Callout tone="warning" title="File storage isn't connected">
              Connect a Vercel Blob store to start from a file. Saved recipes still work.
            </Callout>
          ) : (
            <>
              <Field
                id={`${fileId}-gcode`}
                label="G-code file"
                hint={`Saved as a recipe when the print starts. Plain .gcode from ${SUPPORTED_SLICERS}.`}
              >
                <input
                  id={`${fileId}-gcode`}
                  type="file"
                  accept=".gcode"
                  onChange={(e) => {
                    setFilamentId("");
                    void imp.choose(e.target.files?.[0] ?? null);
                  }}
                  className="control px-3 py-2.5 text-sm text-ink"
                />
              </Field>
              {imp.reading ? <p className="text-sm text-ink-muted">Reading the file…</p> : null}
              {imp.error ? <Callout tone="danger">{imp.error}</Callout> : null}
              {imp.duplicate && dupRecipe ? (
                <>
                  <input type="hidden" name="recipeId" value={dupRecipe.id} />
                  <Callout tone="info" title="Already saved">
                    This file is{" "}
                    <Link
                      className="inline-flex min-h-control items-center font-semibold underline"
                      href={`/recipes/${dupRecipe.id}`}
                    >
                      {dupRecipe.name} v{dupRecipe.version}
                    </Link>
                    . Start uses it; no copy is saved.
                  </Callout>
                </>
              ) : imp.duplicate ? (
                <Callout tone="danger" title="Older version">
                  This file is {imp.duplicate.name} v{imp.duplicate.version}, which is no longer the current version.
                  Choose the current one under Saved recipe.
                </Callout>
              ) : null}
              {fromFile ? (
                <ImportDetails
                  imp={imp}
                  idPrefix={fileId}
                  products={fileOpts.products}
                  versionChoices={groups}
                  nested
                />
              ) : null}
            </>
          )}

          <SelectField
            name="machineId"
            label="Printer"
            placeholder={free.length === 1 ? undefined : "Choose…"}
            options={free.map((p) => ({ value: String(p.id), label: p.name }))}
            onValueChange={setPrinterId}
          />
          <FilamentPick
            value={autoFilament}
            onChange={setFilamentId}
            filaments={options.filaments}
            hint={
              fromFile && !autoFilament && recipe?.material
                ? `More than one filament (or none) in stock is ${recipe.material}. Choose the one on the printer.`
                : undefined
            }
          />
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

/** The filament select; shows the form's error when none was chosen. */
function FilamentPick({
  value,
  onChange,
  filaments,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  filaments: Options["filaments"];
  hint?: string;
}) {
  const { error } = useFieldState("filamentId");
  return (
    <>
      <input type="hidden" name="filamentId" value={value} />
      <Field id="filament-pick" label="Filament" hint={hint} error={value ? undefined : error}>
        <select
          id="filament-pick"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!value && error ? true : undefined}
          className="control px-3 text-ink"
        >
          {value ? null : <option value="">Choose…</option>}
          {filaments.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({Math.round(f.onHand)} g left)
            </option>
          ))}
        </select>
      </Field>
    </>
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
            <Link className="inline-flex min-h-control items-center font-semibold underline" href={map[m][1]}>
              {map[m][0]}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
