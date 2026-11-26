import { Link } from "@/components/ui/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/form/action-form";
import { NumberField, TextareaField } from "@/components/form/fields";
import { formatDuration } from "@/lib/format";
import { Badge, Callout, Card, HistoryList, List, ListRow, PageHeader, buttonClass, formatWhen } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { historyFor } from "@/server/edits/engine";
import { productLabel } from "@/server/products/service";
import { saveOverridesAction } from "@/server/recipes/actions";
import { getRecipe } from "@/server/recipes/service";

const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: number | null, unit: string, dp = 2) => (v == null ? "—" : `${Number(v.toFixed(dp))} ${unit}`);

export default async function RecipePage({ params }: PageProps<"/recipes/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const r = Number.isInteger(id) ? await getRecipe(db(), id) : null;
  if (!r) notFound();
  const history = await historyFor(db(), "recipes", id);
  const kb = Math.round(r.fileSizeBytes / 1024);
  return (
    <div className="flex max-w-content flex-col gap-6">
      <PageHeader
        title={`${r.name} · v${r.version}`}
        action={
          r.isCurrent ? (
            <Link href={`/recipes/import?group=${r.recipeGroup}`} className={buttonClass("secondary")}>
              New version
            </Link>
          ) : undefined
        }
      />
      {r.isCurrent ? null : (
        <Callout tone="info">
          This is an old version, kept as history. Prints use the{" "}
          <Link
            className="inline-flex min-h-control items-center font-semibold underline"
            href={`/recipes/${r.versions.find((v) => v.isCurrent)?.id ?? id}`}
          >
            current version
          </Link>
          .
        </Callout>
      )}

      <Card className="flex flex-col gap-4 md:flex-row">
        {r.thumbnailBlobUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by our auth-checked route, not optimisable
          <img
            src={`/api/files/recipes/${r.id}/thumbnail`}
            alt={`Plate preview of ${r.name}`}
            width={150}
            height={150}
            className="size-36 shrink-0 self-center rounded-md border border-border bg-bg object-contain"
          />
        ) : null}
        <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Spec label="Filament per plate">
            {n(r.totalGrams, "g")}
            <ValueNote note={r.estimatedValues?.totalGrams} />
            {r.gramsOverride != null ? (
              <small className="block text-ink-muted">Using {n(r.gramsOverride, "g")}</small>
            ) : null}
          </Spec>
          <Spec label="Estimated time">
            {formatDuration(r.estimatedSeconds)}
            <ValueNote note={r.estimatedValues?.estimatedSeconds} />
          </Spec>
          <Spec label="Material">{r.material ?? "—"}</Spec>
          <Spec label="Printer">{r.printerModel ?? "—"}</Spec>
          <Spec label="Nozzle">{n(r.nozzleMm, "mm")}</Spec>
          <Spec label="Layer height">{n(r.layerHeightMm, "mm")}</Spec>
          <Spec label="Temperatures">
            {r.nozzleTempC ?? "—"} °C / bed {r.bedTempC ?? "—"} °C
          </Spec>
          <Spec label="Slicer">{[r.slicerName, r.slicerVersion].filter(Boolean).join(" ") || "—"}</Spec>
        </dl>
      </Card>

      <a href={`/api/files/recipes/${r.id}/gcode`} className={buttonClass("secondary", true)} download>
        Download original file ({r.fileName}, {kb} KB)
      </a>

      <section aria-labelledby="items" className="flex flex-col gap-2">
        <h2 id="items" className="text-lg font-semibold">
          Items on the plate
        </h2>
        <List label="Items on the plate">
          {r.items.map((i) => (
            <ListRow
              key={i.id}
              href={`/products/${i.productId}`}
              title={productLabel({ name: i.productName, variant: i.productVariant })}
              subtitle={i.objectName ? `From ${i.objectName}` : undefined}
              badge={i.productKind === "part" ? <Badge tone="neutral">Part</Badge> : undefined}
              trailing={
                <span className="text-sm tabular-nums">
                  {i.qtyOnPlate} × {Number(i.gramsPerPiece.toFixed(3))} g
                </span>
              }
            />
          ))}
        </List>
      </section>

      {r.isCurrent ? (
        <Card>
          <h2 className="pb-3 text-lg font-semibold">Your adjustments</h2>
          <ActionForm
            action={saveOverridesAction.bind(null, r.id)}
            submitLabel="Save adjustments"
            defaults={{
              gramsOverride: s(r.gramsOverride),
              wasteAllowancePctOverride: s(r.wasteAllowancePctOverride),
              labourMinutes: s(r.labourMinutes),
              stepsAndTips: s(r.stepsAndTips),
            }}
          >
            <NumberField
              name="gramsOverride"
              label="Actual grams per plate"
              suffix="g"
              hint={`Blank = the file's ${n(r.totalGrams, "g")}.`}
            />
            <NumberField
              name="wasteAllowancePctOverride"
              label="Waste allowance"
              suffix="%"
              hint="Blank = the Settings value."
            />
            <NumberField
              name="labourMinutes"
              label="Hands-on minutes per plate"
              suffix="min"
              hint="Setup, removal, cleanup."
            />
            <TextareaField name="stepsAndTips" label="Steps and tips" />
            <p className="text-xs text-ink-muted">
              Changes apply to prints started after you save; past prints keep theirs.
            </p>
          </ActionForm>
        </Card>
      ) : null}

      <section aria-labelledby="versions" className="flex flex-col gap-2">
        <h2 id="versions" className="text-lg font-semibold">
          Versions
        </h2>
        <List label="Versions">
          {r.versions.map((v) => (
            <ListRow
              key={v.id}
              href={`/recipes/${v.id}`}
              title={`v${v.version}${v.id === r.id ? " (this one)" : ""}`}
              subtitle={[formatWhen(v.uploadedAt), v.fileName, v.changeNote].filter(Boolean).join(" · ")}
              badge={v.isCurrent ? <Badge tone="success">Current</Badge> : undefined}
            />
          ))}
        </List>
      </section>

      <section aria-labelledby="recipe-history" className="flex flex-col gap-2">
        <h2 id="recipe-history" className="text-lg font-semibold">
          History
        </h2>
        <HistoryList entries={history} />
      </section>
    </div>
  );
}

function Spec({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

/** Says when a value wasn't in the file: worked out by the app, or typed at import (D14). */
function ValueNote({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <small className="block font-normal text-ink-muted">{note.startsWith("Typed") ? note : `Estimated. ${note}`}</small>
  );
}
