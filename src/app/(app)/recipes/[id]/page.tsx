import { notFound } from "next/navigation";
import { ActionForm } from "@/components/form/action-form";
import { NumberField, TextareaField } from "@/components/form/fields";
import { Icon } from "@/components/shell/icons";
import { Badge, Callout, HistoryList, KeyValues, PageHeader, Panel, StatTiles, buttonClass } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { formatDuration, shortDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { costInputs } from "@/server/calculator/service";
import { historyFor } from "@/server/edits/engine";
import { productLabel } from "@/server/products/service";
import { saveOverridesAction } from "@/server/recipes/actions";
import { recipeEstimate } from "@/server/recipes/estimate";
import { getRecipe } from "@/server/recipes/service";
import { currentSettings } from "@/server/settings/service";

const s = (v: unknown) => (v == null ? "" : String(v));
const usd = (n: number) => formatMoney(n, "USD");
const g = (v: number | null) => (v == null ? "—" : `${Number(v.toFixed(1))} g`);

/** Recipe (prototype /recipes/1): what one plate costs, your adjustments, versions, and the file's specs. */
export default async function RecipePage({ params }: PageProps<"/recipes/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const r = Number.isInteger(id) ? await getRecipe(db(), id) : null;
  if (!r) notFound();
  const [history, inputs, settings] = await Promise.all([
    historyFor(db(), "recipes", id),
    costInputs(db()),
    currentSettings(db()),
  ]);
  const est = recipeEstimate(r, r.items, inputs);
  const first = r.items[0];
  const pieces = r.items.reduce((n, i) => n + i.qtyOnPlate, 0);
  const allowanceDefault = typeof settings.failure_allowance_pct === "number" ? settings.failure_allowance_pct : 12;
  const slicer = [r.slicerName, r.slicerVersion].filter(Boolean).join(" ");
  const current = r.versions.find((v) => v.isCurrent);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/recipes", label: "Recipes" }}
        title={
          <>
            {r.name}
            <span className="sr-only"> · v{r.version}</span>
          </>
        }
        badges={<Badge tone="neutral">v{r.version}</Badge>}
        description={[
          slicer || null,
          r.printerModel,
          r.material,
          r.layerHeightMm != null ? `${r.layerHeightMm} mm` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <>
            <a href={`/api/files/recipes/${r.id}/gcode`} className={buttonClass("secondary")} download>
              <Icon name="download" size={15} />
              Download G-code
            </a>
            {r.isCurrent ? (
              <>
                <Link href={`/recipes/import?group=${r.recipeGroup}`} className={buttonClass("secondary")}>
                  <Icon name="upload" size={15} />
                  Import new version
                </Link>
                <Link href={`/print?recipe=${r.id}`} className={buttonClass("primary")}>
                  Start print
                </Link>
              </>
            ) : null}
          </>
        }
      />
      {r.isCurrent ? null : (
        <Callout tone="info">
          This is an old version, kept as history. Prints use the{" "}
          <Link className="font-semibold underline" href={`/recipes/${current?.id ?? id}`}>
            current version (v{current?.version})
          </Link>
          .
        </Callout>
      )}
      <StatTiles
        feature
        items={[
          {
            label: "Job cost",
            value: est.job ? usd(est.job.total) : "—",
            note: est.job
              ? "for one plate"
              : est.missing.length
                ? "a cost setting is missing"
                : "file has no grams or time",
          },
          {
            label: "Per piece",
            value: est.perPiece[0] != null ? usd(est.perPiece[0]) : "—",
            note:
              r.items.length > 1 && first
                ? `${productLabel({ name: first.productName, variant: first.productVariant })} · ${pieces} pieces on the plate`
                : `${pieces} on the plate`,
          },
          { label: "Filament", value: g(est.grams), note: r.material ?? undefined },
          {
            label: "Print time",
            value: formatDuration(r.estimatedSeconds),
            note: r.estimatedValues?.estimatedSeconds ? "worked out by the app" : "from the file",
          },
        ]}
      />
      <div className="grid items-start gap-5 lg:grid-detail">
        <div className="flex min-w-0 flex-col gap-5">
          {r.isCurrent ? (
            <Panel title="Your adjustments" titleId="adjustments">
              <ActionForm
                action={saveOverridesAction.bind(null, r.id)}
                submitLabel="Save adjustments"
                submitVariant="secondary"
                defaults={{
                  gramsOverride: s(r.gramsOverride),
                  wasteAllowancePctOverride: s(r.wasteAllowancePctOverride),
                  labourMinutes: s(r.labourMinutes),
                  stepsAndTips: s(r.stepsAndTips),
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField
                    name="gramsOverride"
                    label="Actual grams per plate"
                    optional
                    suffix="g"
                    placeholder={r.totalGrams != null ? String(Number(r.totalGrams.toFixed(1))) : undefined}
                    hint={
                      r.gramsOverride != null
                        ? `Using ${Number(r.gramsOverride.toFixed(2))} g, not the file's.`
                        : "If the file is off."
                    }
                  />
                  <NumberField name="labourMinutes" label="Hands-on minutes per plate" suffix="min" />
                </div>
                <NumberField
                  name="wasteAllowancePctOverride"
                  label="Waste allowance"
                  optional
                  suffix="%"
                  placeholder={String(allowanceDefault)}
                  hint="Blank = the Settings value."
                />
                <TextareaField name="stepsAndTips" label="Steps and tips" optional />
                <p className="text-xs text-ink-muted">
                  Applies to prints started after you save; past prints keep theirs.
                </p>
              </ActionForm>
            </Panel>
          ) : null}
          <Panel title="Versions" titleId="versions" count={r.versions.length} flush>
            <ul className="divide-y divide-border">
              {r.versions.map((v) => (
                <li key={v.id} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                  <Badge tone={v.isCurrent ? "success" : "neutral"}>{v.isCurrent ? "Current" : "Old"}</Badge>
                  <Link
                    href={`/recipes/${v.id}`}
                    className="inline-flex min-h-control items-center gap-1 font-medium hover:underline"
                  >
                    v{v.version}
                    {v.id === r.id ? <span className="font-normal text-ink-muted"> (this one)</span> : null}
                  </Link>
                  <span className="text-sm text-ink-muted">
                    {[shortDate(v.uploadedAt), v.changeNote ?? (v.version === 1 ? "first import" : null)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <a
                    href={`/api/files/recipes/${v.id}/gcode`}
                    download
                    className="ml-auto inline-flex min-h-control items-center text-sm font-medium text-action hover:underline"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="History" titleId="recipe-history">
            <HistoryList entries={history} />
          </Panel>
        </div>
        <Panel title="From the file" titleId="from-file">
          {r.thumbnailBlobUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- served by our auth-checked route, not optimisable
            <img
              src={`/api/files/recipes/${r.id}/thumbnail`}
              alt={`Plate preview of ${r.name}`}
              width={140}
              height={140}
              className="mx-auto mb-3 size-36 rounded-md border border-border bg-bg object-contain"
            />
          ) : null}
          <KeyValues
            items={[
              ["Slicer", slicer || "Unknown"],
              ["Nozzle", r.nozzleMm != null ? `${r.nozzleMm} mm` : "—"],
              ["Temperatures", `${r.nozzleTempC ?? "—"} °C / ${r.bedTempC ?? "—"} °C`],
              [
                "Filament",
                <>
                  {g(r.totalGrams)}
                  <ValueNote note={r.estimatedValues?.totalGrams} />
                </>,
              ],
              [
                "Print time",
                <>
                  {formatDuration(r.estimatedSeconds)}
                  <ValueNote note={r.estimatedValues?.estimatedSeconds} />
                </>,
              ],
              ["File", `${r.fileName} · ${Math.round(r.fileSizeBytes / 1024)} KB`],
            ]}
          />
          <h3 className="pt-3 pb-1 text-sm font-semibold">Items on the plate</h3>
          <ul aria-label="Items on the plate" className="-mx-4 divide-y divide-border border-t border-border">
            {r.items.map((i) => (
              <li key={i.id}>
                <Link
                  href={`/products/${i.productId}`}
                  className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 hover:bg-surface-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-action">
                      {productLabel({ name: i.productName, variant: i.productVariant })}
                    </span>
                    {i.productKind === "part" ? <Badge tone="neutral">Part</Badge> : null}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {i.qtyOnPlate} × {Number(i.gramsPerPiece.toFixed(3))} g
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

/** Why a value isn't the file's own: typed at import, or worked out by the app (D14). */
function ValueNote({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <small className="block text-xs text-ink-muted">{note.startsWith("Typed") ? note : `Estimated. ${note}`}</small>
  );
}
