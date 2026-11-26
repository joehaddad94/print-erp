"use client";

import { Badge, Callout, Card, Field, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { round, type GcodeImport, type ProductOption, type RecipeGroup } from "./use-gcode-import";

/**
 * What a new .gcode becomes (D14, D17): the file's specs, values to confirm, the recipe name
 * (or the recipe it versions), and the items on the plate with the grams check. Used by Import
 * and by Start print's "From a .gcode file".
 */
export function ImportDetails({
  imp,
  idPrefix,
  products,
  versionChoices,
  nested = false,
}: {
  imp: GcodeImport;
  idPrefix: string;
  products: ProductOption[];
  /** Start print: recipes this file can become a new version of. Omitted on Import. */
  versionChoices?: RecipeGroup[];
  /** Inside another card (Start print): sections are divided by a rule instead of nested cards. */
  nested?: boolean;
}) {
  const { parsed, rows, update, gramsEstimated, timeEstimated, check, plateGrams } = imp;
  if (!parsed) return null;
  return (
    <>
      <Section nested={nested} className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">From the file</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Spec label="Filament">
            {round(parsed.totalGrams ?? 0, 2)} g{gramsEstimated ? <EstimatedTag /> : null}
          </Spec>
          <Spec label="Estimated time">
            {formatDuration(parsed.estimatedSeconds)}
            {timeEstimated ? <EstimatedTag /> : null}
          </Spec>
          <Spec label="Material">{parsed.material ?? "—"}</Spec>
          <Spec label="Printer">{parsed.printerModel ?? "—"}</Spec>
          <Spec label="Nozzle">{parsed.nozzleMm != null ? `${parsed.nozzleMm} mm` : "—"}</Spec>
          <Spec label="Layer height">{parsed.layerHeightMm != null ? `${parsed.layerHeightMm} mm` : "—"}</Spec>
          <Spec label="Slicer">{[parsed.slicerName, parsed.slicerVersion].filter(Boolean).join(" ") || "Unknown"}</Spec>
        </dl>
      </Section>

      {gramsEstimated || timeEstimated ? (
        <Section nested={nested} className="flex flex-col gap-4">
          <Callout tone="warning" title="Check the estimated values">
            This file doesn&apos;t state{" "}
            {gramsEstimated && timeEstimated ? "the grams or the time" : gramsEstimated ? "the grams" : "the time"}, so
            the app worked {gramsEstimated && timeEstimated ? "them" : "it"} out. Type the slicer&apos;s number if you
            have it.
          </Callout>
          <div className="grid grid-cols-2 gap-3">
            {gramsEstimated ? (
              <Field id={`${idPrefix}-total-grams`} label="Filament per plate (g)" hint={parsed.estimated.totalGrams}>
                <Input
                  id={`${idPrefix}-total-grams`}
                  inputMode="decimal"
                  value={imp.totalGrams}
                  onChange={(e) => imp.changeTotal(e.target.value)}
                />
              </Field>
            ) : null}
            {timeEstimated ? (
              <Field id={`${idPrefix}-minutes`} label="Print time (minutes)" hint={parsed.estimated.estimatedSeconds}>
                <Input
                  id={`${idPrefix}-minutes`}
                  inputMode="numeric"
                  value={imp.minutes}
                  onChange={(e) => imp.setMinutes(e.target.value)}
                />
              </Field>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section nested={nested} className="flex flex-col gap-4">
        {versionChoices && versionChoices.length > 0 ? (
          <Field
            id={`${idPrefix}-save-as`}
            label="Save the file as"
            hint={imp.group ? "Older versions stay as they are." : undefined}
          >
            <select
              id={`${idPrefix}-save-as`}
              value={imp.group?.recipeGroup ?? ""}
              onChange={(e) => imp.setGroup(versionChoices.find((g) => g.recipeGroup === e.target.value))}
              className="control px-3 text-ink"
            >
              <option value="">A new recipe</option>
              {versionChoices.map((g) => (
                <option key={g.recipeGroup} value={g.recipeGroup}>
                  New version of {g.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field id={`${idPrefix}-recipe-name`} label="Recipe name">
          <Input
            id={`${idPrefix}-recipe-name`}
            value={imp.name}
            onChange={(e) => imp.setName(e.target.value)}
            disabled={!!imp.group}
          />
        </Field>
        {imp.group ? (
          <Field id={`${idPrefix}-change-note`} label="What changed" hint="Saved with this version.">
            <Input
              id={`${idPrefix}-change-note`}
              value={imp.changeNote}
              onChange={(e) => imp.setChangeNote(e.target.value)}
            />
          </Field>
        ) : null}
      </Section>

      <Section nested={nested} className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Items on the plate</h2>
        {rows.map((r, i) => (
          <fieldset key={i} className="flex flex-col gap-3 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-semibold">{r.label}</legend>
            <Field id={`${idPrefix}-item-${i}-product`} label="Product or part">
              <select
                id={`${idPrefix}-item-${i}-product`}
                value={r.productId}
                onChange={(e) => update(i, { productId: e.target.value })}
                className="control px-3 text-ink"
              >
                <option value="">New product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            {r.productId ? null : (
              <Field id={`${idPrefix}-item-${i}-new`} label="New product name">
                <Input
                  id={`${idPrefix}-item-${i}-new`}
                  value={r.newName}
                  onChange={(e) => update(i, { newName: e.target.value })}
                />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field id={`${idPrefix}-item-${i}-qty`} label="Pieces on plate">
                <Input
                  id={`${idPrefix}-item-${i}-qty`}
                  inputMode="numeric"
                  value={r.qty}
                  onChange={(e) => update(i, { qty: e.target.value })}
                />
              </Field>
              <Field id={`${idPrefix}-item-${i}-grams`} label="Grams per piece">
                <Input
                  id={`${idPrefix}-item-${i}-grams`}
                  inputMode="decimal"
                  value={r.grams}
                  onChange={(e) => update(i, { grams: e.target.value })}
                />
              </Field>
            </div>
          </fieldset>
        ))}
        {check ? (
          <p
            role="status"
            className={cn("text-sm font-semibold", check.ok ? "text-success" : "text-danger")}
            data-testid="grams-check"
          >
            {check.ok
              ? `Items add up to ${round(check.sum, 2)} g of ${round(plateGrams, 2)} g.`
              : `Items add up to ${round(check.sum, 2)} g but the ${gramsEstimated ? "plate" : "file"} uses ${round(plateGrams, 2)} g: ` +
                `${check.gap > 0 ? "+" : ""}${round(check.gap, 2)} g (allowed ±${round(check.allowed, 2)} g).`}
          </p>
        ) : null}
      </Section>
    </>
  );
}

function EstimatedTag() {
  return (
    <span className="ms-2">
      <Badge tone="warning">Estimated</Badge>
    </span>
  );
}

function Spec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

/** A card on Import; inside Start's card, a section divided by a rule (no cards in cards). */
function Section({ nested, className, children }: { nested: boolean; className: string; children: React.ReactNode }) {
  return nested ? (
    <section className={cn(className, "border-t border-border pt-4")}>{children}</section>
  ) : (
    <Card className={className}>{children}</Card>
  );
}
