"use client";

import { Link } from "@/components/ui/link";
import { useId, useRef, useState, type ReactNode } from "react";
import { ActionForm, useFieldState } from "@/components/form/action-form";
import { NumberField, SelectField } from "@/components/form/fields";
import { uploadGcode } from "@/components/recipes/gcode-client";
import { ImportDetails } from "@/components/recipes/import-details";
import { num, useGcodeImport, type ProductOption, type RecipeGroup } from "@/components/recipes/use-gcode-import";
import { Callout, Card, CostLine, CostTotal, FileDrop, Panel, Segmented } from "@/components/ui";
import { Icon } from "@/components/shell/icons";
import { PrinterChoice } from "./printer-choice";
import { SearchPicker } from "@/components/ui/search-picker";
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

export function StartForm({
  options,
  file: fileOpts,
  initialRecipeId,
}: {
  options: Options;
  file: FileOptions;
  /** "Print more" on a product or recipe page opens Start with that recipe picked. */
  initialRecipeId?: string;
}) {
  const free = options.printers.filter((p) => !p.busy);
  const fileId = useId();
  const groups = groupsOf(options.recipes);
  const picked =
    initialRecipeId && options.recipes.some((r) => String(r.id) === initialRecipeId) ? initialRecipeId : "";
  const [source, setSource] = useState<"recipe" | "file">(picked || !fileOpts.available ? "recipe" : "file");
  const [recipeId, setRecipeId] = useState(picked);
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

  const perPiece =
    estimate?.complete && recipe && recipe.items.length === 1
      ? unitCost({
          share: estimate.total,
          planned: recipe.items[0]!.qty,
          good: recipe.items[0]!.qty,
          method: options.method,
          allowancePct: allowance,
        })
      : null;
  const hours = (recipe?.estimatedSeconds ?? 0) / 3600;
  const pieces = recipe ? recipe.items.reduce((n, x) => n + x.qty, 0) : 0;

  const costPanel = (
    <Panel title="Cost of this print" titleId="start-cost">
      <div aria-live="polite">
        {!recipe ? (
          <p className="text-sm text-ink-muted">Choose what to print.</p>
        ) : estimate?.complete ? (
          <dl className="flex flex-col">
            <CostLine
              label={`Filament · ${Number(recipe.plateGrams.toFixed(1))} g × ${usd(filament!.costPerGramUsd!)}`}
              value={usd(estimate.filament)}
            />
            <CostLine
              label={`Electricity · ${Number(hours.toFixed(2))} h × ${printer!.powerKw} kW × ${usd(options.kwhPriceUsd!)}`}
              value={usd(estimate.electricity)}
            />
            <CostLine label={`Machine wear · ${Number(hours.toFixed(2))} h`} value={usd(estimate.wear)} />
            <CostTotal label="Job cost" value={usd(estimate.total)} />
            {perPiece != null ? (
              <CostLine
                strong
                label={
                  <>
                    Per piece ({pieces} on the plate)
                    {options.method === "allowance" ? (
                      <span className="block text-xs font-normal text-ink-muted">
                        incl. {allowance}% failure allowance
                      </span>
                    ) : null}
                  </>
                }
                value={usd(perPiece)}
              />
            ) : (
              <CostLine label="On the plate" value={recipe.items.map((x) => `${x.qty} × ${x.name}`).join(", ")} />
            )}
          </dl>
        ) : estimate ? (
          <MissingList missing={estimate.missing} printerId={printer?.id} />
        ) : (
          <p className="text-sm text-ink-muted">Choose a printer and filament to see the cost.</p>
        )}
      </div>
    </Panel>
  );

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
          cancelHref="/"
          defaults={{ machineId: printerId, filamentId: autoFilament }}
          aside={costPanel}
        >
          <Card className="flex flex-col gap-4">
            <Segmented
              name={`${fileId}-source`}
              legend="Print from"
              defaultValue={source}
              options={[
                { value: "file", label: "G-code file" },
                { value: "recipe", label: "Saved recipe" },
              ]}
              onChange={(v) => setSource(v as "file" | "recipe")}
            />

            {source === "recipe" ? (
              <WithError name="recipeId">
                {(recipeError) => (
                  <SearchPicker
                    name="recipeId"
                    defaultId={picked || undefined}
                    label="Recipe"
                    placeholder="Search recipes"
                    hint="Search by recipe, product or material. Recently printed show first."
                    recentLabel="Recently printed"
                    items={options.recipes.map((r) => ({
                      id: String(r.id),
                      label: `${r.name} · v${r.version}`,
                      sub: `${r.items.map((i) => `${i.qty} × ${i.name}`).join(", ")} · ${r.material ?? ""} · ${Number(
                        r.plateGrams.toFixed(1),
                      )} g · ${formatDuration(r.estimatedSeconds)}`,
                      keywords: r.material ?? undefined,
                    }))}
                    recentIds={options.recentRecipeIds.map(String)}
                    empty="No recipe matches. Use the G-code file tab to add it."
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
                <FileDrop
                  id={`${fileId}-gcode`}
                  label="G-code file"
                  accept=".gcode"
                  file={imp.file ?? null}
                  status={
                    imp.reading
                      ? "reading…"
                      : imp.parsed
                        ? `${imp.parsed.slicerName ?? "Unknown slicer"} · read OK`
                        : undefined
                  }
                  hint={`Saved as a recipe when the print starts. Plain .gcode from ${SUPPORTED_SLICERS}.`}
                  onFile={(f) => {
                    setFilamentId(undefined);
                    void imp.choose(f);
                  }}
                />
                {imp.error ? <Callout tone="danger">{imp.error}</Callout> : null}
                {imp.duplicate && dupRecipe ? (
                  <>
                    <input type="hidden" name="recipeId" value={dupRecipe.id} />
                    <Callout tone="success" title="Already saved.">
                      This file is{" "}
                      <Link
                        className="inline-flex min-h-control items-center font-semibold underline"
                        href={`/recipes/${dupRecipe.id}`}
                      >
                        {dupRecipe.name} v{dupRecipe.version}
                      </Link>
                      . Start uses it, and no copy is saved.
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
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold tracking-wider text-ink-muted uppercase">Machine and filament</h2>
            <div className="flex flex-col gap-1.5">
              <PrinterChoice
                name="machineId"
                printers={options.printers.map((p) => ({ ...p, busy: !!p.busy }))}
                value={printerId}
                onChange={setPrinterId}
              />
              <p className="text-xs text-ink-muted">
                {free.length === 1 && options.printers.length === 1
                  ? "Your only active printer, so it is picked for you. A busy printer cannot be picked."
                  : "A busy printer cannot be picked."}
              </p>
              <WithError name="machineId">
                {(e) => (e ? <p className="text-sm font-medium text-danger">{e}</p> : null)}
              </WithError>
            </div>

            <WithError name="filamentId">
              {(filamentError) => (
                <SearchPicker
                  name="filamentId"
                  label="Filament"
                  placeholder="Search material or colour"
                  value={autoFilament}
                  onChange={(id) => setFilamentId(id ?? "")}
                  recentIds={matching}
                  recentLabel={recipe?.material ? `Matches the file · ${recipe.material}` : undefined}
                  error={autoFilament ? undefined : filamentError}
                  hint={
                    fromFile && !autoFilament && recipe?.material
                      ? `More than one filament (or none) in stock is ${recipe.material}. Choose the one on the printer.`
                      : "Filament that matches the file is listed first."
                  }
                  items={options.filaments.map((f) => ({
                    id: String(f.id),
                    label: f.name,
                    sub: [
                      f.onHand > 0 ? `${Math.round(f.onHand).toLocaleString("en-US")} g left` : "Out of stock",
                      f.costPerGramUsd != null ? `${usd(f.costPerGramUsd * 1000)}/kg` : null,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                    keywords: f.material ?? undefined,
                    badge: f.onHand > 0 && f.low ? "Low" : undefined,
                    disabled: f.onHand <= 0,
                  }))}
                  empty="No filament matches. Buy it under Add purchase."
                />
              )}
            </WithError>
            {recipe ? (
              <p className="-mt-2 text-sm text-ink-muted">
                {Number(recipe.plateGrams.toFixed(1))} g from the file. Weigh or correct it at Finish.
              </p>
            ) : null}

            <details className="group" open={!!secondId}>
              <summary className="flex min-h-control cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-action">
                <Icon name="chevron" size={14} className="transition-transform group-open:rotate-90" />
                Add a second filament (colour change)
              </summary>
              <div className="flex flex-col gap-3 pt-2">
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
          </Card>
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
    filament_cost: ["Add a purchase of this filament", "/purchases/new"],
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
