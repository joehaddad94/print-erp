"use client";

import { Link } from "@/components/ui/link";
import { useId, useRef, useState, type ReactNode } from "react";
import { ActionForm, useFieldState } from "@/components/form/action-form";
import { NumberField, SelectField } from "@/components/form/fields";
import { uploadGcode } from "@/components/recipes/gcode-client";
import { ImportDetails } from "@/components/recipes/import-details";
import { num, useGcodeImport, type ProductOption, type RecipeGroup } from "@/components/recipes/use-gcode-import";
import { Button, Callout, Field } from "@/components/ui";
import { SearchPicker } from "@/components/ui/search-picker";
import { LOW_FILAMENT_G } from "@/lib/filament";
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
  /** undefined = picked for you from the recipe's material; "" = cleared by you. */
  const [filamentId, setFilamentId] = useState<string | undefined>(undefined);
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
    filamentId ??
    (fromFile
      ? onlyMatch(options.filaments, recipe?.material)
      : String(
          options.filaments.find(
            (f) => f.onHand > 0 && recipe?.material && f.material?.toLowerCase() === recipe.material.toLowerCase(),
          )?.id ??
            options.filaments.find((f) => f.onHand > 0)?.id ??
            "",
        ));
  const filament = options.filaments.find((f) => String(f.id) === autoFilament);

  /** Filament of the recipe's material comes first in the picker. */
  const matching = recipe?.material
    ? options.filaments
        .filter((f) => f.onHand > 0 && f.material?.toLowerCase() === recipe.material!.toLowerCase())
        .map((f) => String(f.id))
    : [];

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
          className="grid items-start gap-5 lg:grid-aside"
        >
          <div className="flex min-w-0 flex-col gap-4">
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
              <WithError name="recipeId">
                {(recipeError) => (
                  <SearchPicker
                    name="recipeId"
                    label="Recipe"
                    placeholder="Search recipes"
                    items={options.recipes.map((r) => ({
                      id: String(r.id),
                      label: `${r.name} · v${r.version}`,
                      sub: `${Number(r.plateGrams.toFixed(1))} g · ${formatDuration(r.estimatedSeconds)} · ${r.items
                        .map((i) => `${i.qty} × ${i.name}`)
                        .join(", ")}`,
                      keywords: r.material ?? undefined,
                    }))}
                    recentIds={options.recentRecipeIds.map(String)}
                    error={recipeError}
                    onChange={(id) => {
                      setRecipeId(id ?? "");
                      setFilamentId(undefined);
                    }}
                  />
                )}
              </WithError>
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
                      setFilamentId(undefined);
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

            <fieldset className="flex flex-col gap-1.5">
              <legend className="pb-1.5 text-sm font-medium text-ink-soft">Printer</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {free.map((p) => (
                  <label
                    key={p.id}
                    className="relative flex min-h-control cursor-pointer items-center gap-3 rounded-md border border-border-strong bg-surface px-3 py-2 has-checked:border-action has-checked:bg-action-soft"
                  >
                    <input
                      type="radio"
                      name="machineId"
                      value={p.id}
                      checked={printerId === String(p.id)}
                      onChange={() => setPrinterId(String(p.id))}
                      className="peer absolute inset-0 size-full cursor-pointer opacity-0"
                    />
                    <span
                      aria-hidden
                      className="grid size-4 shrink-0 place-items-center rounded-full border border-border-strong peer-checked:border-action peer-focus-visible:outline-2 peer-focus-visible:outline-action peer-checked:after:size-2 peer-checked:after:rounded-full peer-checked:after:bg-action"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block truncate text-sm text-ink-muted">
                        {[p.model, p.nozzleMm != null ? `${p.nozzleMm} mm nozzle` : null].filter(Boolean).join(" · ") ||
                          "Free"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <WithError name="machineId">
                {(e) => (e ? <p className="text-sm font-medium text-danger">{e}</p> : null)}
              </WithError>
            </fieldset>

            <WithError name="filamentId">
              {(filamentError) => (
                <SearchPicker
                  name="filamentId"
                  label="Filament"
                  placeholder="Search filament"
                  value={autoFilament}
                  onChange={(id) => setFilamentId(id ?? "")}
                  recentIds={matching}
                  recentLabel={recipe?.material ? `Matches ${recipe.material}` : undefined}
                  error={autoFilament ? undefined : filamentError}
                  items={options.filaments.map((f) => ({
                    id: String(f.id),
                    label: f.name,
                    sub: `${Math.round(f.onHand)} g left${f.material ? ` · ${f.material}` : ""}`,
                    badge: f.onHand <= 0 ? "Out" : f.onHand < LOW_FILAMENT_G ? "Low" : undefined,
                    disabled: f.onHand <= 0,
                  }))}
                />
              )}
            </WithError>
            {fromFile && !autoFilament && recipe?.material ? (
              <p className="-mt-2 text-sm text-ink-muted">
                More than one filament (or none) in stock is {recipe.material}. Choose the one on the printer.
              </p>
            ) : null}

            <details className="rounded-md border border-border px-3" open={!!secondId}>
              <summary className="flex min-h-control cursor-pointer items-center text-sm font-medium text-ink-soft">
                Second filament (colour change)
              </summary>
              <div className="flex flex-col gap-3 pb-3">
                <SelectField
                  name="secondFilamentId"
                  label="Second filament"
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
              </div>
            </details>

            {recipe && printer
              ? mismatch(recipe, printer).map((m) => (
                  <Callout key={m} tone="warning">
                    {m}
                  </Callout>
                ))
              : null}
          </div>

          <aside
            aria-label="Estimate"
            className="flex flex-col gap-2 self-start rounded-lg border border-border bg-bg p-4 text-sm lg:sticky lg:top-4"
            aria-live="polite"
          >
            <h2 className="text-md font-semibold">Estimate</h2>
            {recipe ? (
              <>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <dt className="text-ink-muted">Filament</dt>
                  <dd className="text-right tabular-nums">{Number(recipe.plateGrams.toFixed(2))} g</dd>
                  <dt className="text-ink-muted">Time</dt>
                  <dd className="text-right tabular-nums">{formatDuration(recipe.estimatedSeconds)}</dd>
                  <dt className="text-ink-muted">On the plate</dt>
                  <dd className="text-right">{recipe.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</dd>
                </dl>
                {estimate?.complete ? (
                  <p className="border-t border-border pt-2 font-semibold">
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
                ) : (
                  <p className="text-ink-muted">Choose a printer and filament to see the cost.</p>
                )}
              </>
            ) : (
              <p className="text-ink-muted">Choose what to print.</p>
            )}
          </aside>
        </ActionForm>
      )}
    </div>
  );
}

/** The form's error for one field (ActionForm context), passed to a render function. */
function WithError({ name, children }: { name: string; children: (error?: string) => ReactNode }) {
  return <>{children(useFieldState(name).error)}</>;
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
