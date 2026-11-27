"use client";

import { Badge, Callout, Card, Field, Input, Segmented } from "@/components/ui";
import { AffixInput } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { round, type GcodeImport, type ProductOption, type RecipeGroup } from "./use-gcode-import";

/**
 * What a new .gcode becomes (D14, D17), as in the prototype's Import G-code: what the file says,
 * what's on the plate (with the grams check), and what to save it as. Used by Import and by
 * Start print's "G-code file" (nested: sections divided by a rule instead of cards).
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
  /** Recipes this file can become a new version of. */
  versionChoices?: RecipeGroup[];
  /** Inside another card (Start print): sections are divided by a rule instead of nested cards. */
  nested?: boolean;
}) {
  const { parsed, rows, update, gramsEstimated, timeEstimated, check, plateGrams } = imp;
  if (!parsed) return null;
  const canVersion = !imp.fixedGroup && !!versionChoices?.length;
  return (
    <>
      <Section nested={nested} title="From the file">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Spec label="Slicer">{[parsed.slicerName, parsed.slicerVersion].filter(Boolean).join(" ") || "Unknown"}</Spec>
          <Spec label="Printer">{parsed.printerModel ?? "—"}</Spec>
          <Spec label="Nozzle">{parsed.nozzleMm != null ? `${parsed.nozzleMm} mm` : "—"}</Spec>
          <Spec label="Material">{parsed.material ?? "—"}</Spec>
          <Spec label="Layer height">{parsed.layerHeightMm != null ? `${parsed.layerHeightMm} mm` : "—"}</Spec>
          {timeEstimated ? null : <Spec label="Print time">{formatDuration(parsed.estimatedSeconds)}</Spec>}
          {gramsEstimated ? null : <Spec label="Filament per plate">{round(parsed.totalGrams ?? 0, 2)} g</Spec>}
        </dl>
        {gramsEstimated || timeEstimated ? (
          <>
            <Callout tone="warning" title="Check the estimated values">
              This file doesn&apos;t state{" "}
              {gramsEstimated && timeEstimated ? "the grams or the time" : gramsEstimated ? "the grams" : "the time"},
              so the app worked {gramsEstimated && timeEstimated ? "them" : "it"} out. Type the slicer&apos;s number if
              you have it.
            </Callout>
            <div className="grid gap-3 sm:grid-cols-2">
              {gramsEstimated ? (
                <Field
                  id={`${idPrefix}-total-grams`}
                  label="Filament per plate (g)"
                  hint={
                    <>
                      <Badge tone="warning">Estimated</Badge> {parsed.estimated.totalGrams}
                    </>
                  }
                >
                  <AffixInput
                    id={`${idPrefix}-total-grams`}
                    inputMode="decimal"
                    suffix="g"
                    value={imp.totalGrams}
                    onChange={(e) => imp.changeTotal(e.target.value)}
                  />
                </Field>
              ) : null}
              {timeEstimated ? (
                <Field
                  id={`${idPrefix}-minutes`}
                  label="Print time (minutes)"
                  hint={
                    <>
                      <Badge tone="warning">Estimated</Badge> {parsed.estimated.estimatedSeconds}
                    </>
                  }
                >
                  <AffixInput
                    id={`${idPrefix}-minutes`}
                    inputMode="numeric"
                    suffix="min"
                    value={imp.minutes}
                    onChange={(e) => imp.setMinutes(e.target.value)}
                  />
                </Field>
              ) : null}
            </div>
          </>
        ) : null}
      </Section>

      <Section nested={nested} title="What's on the plate">
        {rows.map((r, i) => (
          <fieldset
            key={i}
            className={cn("flex flex-col gap-3", rows.length > 1 && "rounded-md border border-border p-3")}
          >
            {rows.length > 1 ? <legend className="px-1 text-sm font-semibold">{r.label}</legend> : null}
            <div className="grid gap-3 sm:grid-cols-2">
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
              <Field id={`${idPrefix}-item-${i}-qty`} label="Pieces on plate">
                <Input
                  id={`${idPrefix}-item-${i}-qty`}
                  inputMode="numeric"
                  value={r.qty}
                  onChange={(e) => update(i, { qty: e.target.value })}
                  className="tabular-nums"
                />
              </Field>
            </div>
            {r.productId ? null : (
              <Field id={`${idPrefix}-item-${i}-new`} label="New product name">
                <Input
                  id={`${idPrefix}-item-${i}-new`}
                  value={r.newName}
                  onChange={(e) => update(i, { newName: e.target.value })}
                />
              </Field>
            )}
            <Field
              id={`${idPrefix}-item-${i}-grams`}
              label="Grams per piece"
              hint={rows.length > 1 ? "Splits the cost when the plate has more than one product." : undefined}
            >
              <AffixInput
                id={`${idPrefix}-item-${i}-grams`}
                inputMode="decimal"
                suffix="g"
                value={r.grams}
                onChange={(e) => update(i, { grams: e.target.value })}
                className="tabular-nums"
              />
            </Field>
          </fieldset>
        ))}
        {check ? (
          <p
            role="status"
            className={cn("text-sm font-medium", check.ok ? "text-success" : "text-danger")}
            data-testid="grams-check"
          >
            {check.ok
              ? `Items add up to ${round(check.sum, 2)} g of ${round(plateGrams, 2)} g.`
              : `Items add up to ${round(check.sum, 2)} g but the ${gramsEstimated ? "plate" : "file"} uses ${round(plateGrams, 2)} g: ` +
                `${check.gap > 0 ? "+" : ""}${round(check.gap, 2)} g (allowed ±${round(check.allowed, 2)} g).`}
          </p>
        ) : null}
      </Section>

      <Section nested={nested} title="Save as">
        {canVersion ? (
          <Segmented
            key={imp.group ? "version" : "new"}
            name={`${idPrefix}-save-as`}
            legend="Save the file as"
            defaultValue={imp.group ? "version" : "new"}
            options={[
              { value: "new", label: "A new recipe" },
              { value: "version", label: "New version of a recipe" },
            ]}
            onChange={(v) => imp.setGroup(v === "version" ? versionChoices![0] : undefined)}
          />
        ) : null}
        {imp.group && canVersion ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${idPrefix}-version-of`} label="Recipe">
              <select
                id={`${idPrefix}-version-of`}
                value={imp.group.recipeGroup}
                onChange={(e) => imp.setGroup(versionChoices!.find((g) => g.recipeGroup === e.target.value))}
                className="control px-3 text-ink"
              >
                {versionChoices!.map((g) => (
                  <option key={g.recipeGroup} value={g.recipeGroup}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
            <ChangeNote imp={imp} idPrefix={idPrefix} />
          </div>
        ) : imp.group ? (
          <ChangeNote imp={imp} idPrefix={idPrefix} />
        ) : (
          <Field id={`${idPrefix}-recipe-name`} label="Recipe name">
            <Input id={`${idPrefix}-recipe-name`} value={imp.name} onChange={(e) => imp.setName(e.target.value)} />
          </Field>
        )}
      </Section>
    </>
  );
}

function ChangeNote({ imp, idPrefix }: { imp: GcodeImport; idPrefix: string }) {
  return (
    <Field id={`${idPrefix}-change-note`} label="What changed" optional hint="Saved with this version.">
      <Input
        id={`${idPrefix}-change-note`}
        value={imp.changeNote}
        placeholder="Thicker arms"
        onChange={(e) => imp.setChangeNote(e.target.value)}
      />
    </Field>
  );
}

function Spec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="truncate font-medium">{children}</dd>
    </div>
  );
}

/** A card on Import; inside Start's card, a section divided by a rule (no cards in cards). */
function Section({ nested, title, children }: { nested: boolean; title: string; children: React.ReactNode }) {
  const heading = <h2 className="text-xs font-semibold tracking-wider text-ink-muted uppercase">{title}</h2>;
  return nested ? (
    <section className="flex flex-col gap-4 border-t border-border pt-4">
      {heading}
      {children}
    </section>
  ) : (
    <Card className="flex flex-col gap-4">
      {heading}
      {children}
    </Card>
  );
}
