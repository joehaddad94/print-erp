import { notFound } from "next/navigation";
import { FinishForm, type FinishDefaults } from "@/components/printing/finish-form";
import { Badge, PageHeader, Panel, Timeline, buttonClass } from "@/components/ui";
import { Icon } from "@/components/shell/icons";
import { Link } from "@/components/ui/link";
import { computeFinish } from "@/server/printing/compute";
import { db } from "@/db";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { historyFor } from "@/server/edits/engine";
import { editPrintAction, finishPrintAction } from "@/server/printing/actions";
import { getJob, jobForFinish } from "@/server/printing/service";
import { productLabel } from "@/server/products/service";

const s = (v: number | null | undefined) => (v == null ? "" : String(Number(v.toFixed(3))));

const TZ = "Asia/Beirut";
const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
/** "today 10:15", "26 Nov 10:15". */
const when = (d: Date) =>
  day(d) === day(new Date())
    ? `today ${time(d)}`
    : `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ })} ${time(d)}`;

/** Print (prototype /print/91 Finish print, /print/88 a finished print with Edit). */
export default async function PrintJobPage({ params, searchParams }: PageProps<"/print/[id]">) {
  await requireUser();
  const editing = (await searchParams).edit === "1";
  const id = Number((await params).id);
  const job = Number.isInteger(id) ? await getJob(db(), id) : null;
  if (!job) notFound();
  const finished = job.finishedAt != null;
  const estimateHours = job.estimatedSeconds != null ? job.estimatedSeconds / 3600 : null;
  const items = job.items.map((i) => ({
    id: i.line.id,
    name: productLabel({ name: i.productName, variant: i.productVariant }),
    qtyPlanned: i.line.qtyPlanned,
    kind: i.productKind,
    gramsPerPiece: i.line.gramsPerPiece,
  }));
  const forFinish = jobForFinish(job);
  const filaments = job.filaments.map((f) => ({
    id: f.line.id,
    name: f.name,
    fileGrams: forFinish.filaments.find((x) => x.id === f.line.id)?.plannedGrams ?? null,
  }));
  const defaults: FinishDefaults = finished
    ? {
        hours: s(job.hours),
        hoursSource: job.hoursSource ?? "entered",
        stoppedAtPct: s(job.stoppedAtPct),
        good: Object.fromEntries(job.items.map((i) => [i.line.id, s(i.line.qtyGood)])),
        weighed: Object.fromEntries(job.filaments.map((f) => [f.line.id, s(f.line.weighedGrams)])),
        powerCut: job.powerCut,
        failureReason: job.failureReason ?? "",
      }
    : {
        hours: s(estimateHours),
        hoursSource: "gcode_estimate",
        stoppedAtPct: "100",
        good: {},
        weighed: {},
        powerCut: false,
        failureReason: "",
      };
  const history = finished ? await historyFor(db(), "print_jobs", id) : [];
  const estimated = job.filaments.some((f) => f.line.gramsSource !== "weighed");
  const form = (
    <FinishForm
      action={(finished ? editPrintAction : finishPrintAction).bind(null, id)}
      job={forFinish}
      estimateHours={estimateHours}
      items={items}
      filaments={filaments}
      defaults={defaults}
      submitLabel={finished ? "Save changes" : "Finish print"}
      cancelHref={finished ? `/print/${id}` : "/"}
    />
  );
  const recipe = `${job.recipe.name} · v${job.recipe.version}`;
  if (!finished)
    return (
      <div className="flex flex-col gap-5">
        <PageHeader
          back={{ href: "/", label: "Today" }}
          title="Finish print"
          badges={<Badge tone="info">Printing now</Badge>}
          description={`${recipe} · ${job.machine.name} · started ${when(job.startedAt)}`}
        />
        {form}
      </div>
    );

  const good = job.items.reduce((n, i) => n + (i.line.qtyGood ?? 0), 0);
  const planned = job.items.reduce((n, i) => n + i.line.qtyPlanned, 0);
  const pct = Number(job.stoppedAtPct ?? 100);
  const cost = computeFinish(forFinish, {
    hours: job.hours ?? 0,
    stoppedAtPct: pct,
    good: Object.fromEntries(job.items.map((i) => [i.line.id, i.line.qtyGood ?? 0])),
    weighed: Object.fromEntries(job.filaments.map((f) => [f.line.id, f.line.weighedGrams])),
  });
  const usd = (n: number) => formatMoney(n, "USD");
  const usedGrams = job.filaments.reduce((g, f) => g + Number(f.line.gramsUsed), 0);
  const charged = cost.complete ? cost.items.reduce((sum, it) => sum + (it.unitCost ?? 0) * it.good, 0) : null;
  const allowance = cost.complete && charged != null ? Math.max(0, charged - cost.total + cost.wasteTotal) : null;
  const perPiece = cost.complete && good > 0 ? charged! / good : null;
  const title =
    job.items.length === 1
      ? `${productLabel({ name: job.items[0]!.productName, variant: job.items[0]!.productVariant })} ×${good}`
      : `${job.recipe.name} ×${good}`;
  const timeline = [
    { id: "finished", at: job.finishedAt!, text: "Finished" },
    ...history.map((e) => ({
      id: `e-${e.id}`,
      at: e.editedAt,
      text: (
        <>
          Edited: {e.field.replace(/_/g, " ")}{" "}
          <span className="text-ink-muted line-through">{e.oldValue == null ? "—" : String(e.oldValue)}</span> →{" "}
          <span className="text-action">{e.newValue == null ? "—" : String(e.newValue)}</span>
        </>
      ),
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/", label: "Today" }}
        title={title}
        badges={
          <>
            {pct < 100 ? <Badge tone="warning">Stopped at {pct}%</Badge> : <Badge tone="success">Finished</Badge>}
            {estimated ? <Badge tone="estimated">Estimated grams</Badge> : <Badge tone="success">Weighed</Badge>}
          </>
        }
        description={`${recipe} · ${job.machine.name} · ${when(job.startedAt)} → ${time(job.finishedAt!)}`}
        action={
          editing ? undefined : (
            <Link href={`/print/${id}?edit=1`} className={buttonClass("secondary")}>
              <Icon name="edit" size={15} />
              Edit
            </Link>
          )
        }
      />
      {editing ? (
        form
      ) : (
        <div className="grid items-start gap-5 lg:grid-detail">
          <div className="flex min-w-0 flex-col gap-5">
            <Panel title="Result" titleId="print-result">
              <dl className="flex flex-col divide-y divide-border text-md">
                <Fact label="Good pieces" value={`${good} of ${planned}`} />
                <Fact label="Print time" value={`${Number((job.hours ?? 0).toFixed(2))} h`} />
                <Fact
                  label="Filament"
                  value={job.filaments
                    .map(
                      (f) =>
                        `${f.name} · ${Number(Number(f.line.gramsUsed).toFixed(1))} g${f.line.weighedGrams != null ? " weighed" : ""}`,
                    )
                    .join(", ")}
                />
                <Fact
                  label="Added to stock"
                  value={
                    job.items
                      .filter((i) => (i.line.qtyGood ?? 0) > 0)
                      .map(
                        (i) =>
                          `${i.line.qtyGood} × ${productLabel({ name: i.productName, variant: i.productVariant })}`,
                      )
                      .join(", ") || "Nothing"
                  }
                />
                {job.failureReason ? <Fact label="What went wrong" value={job.failureReason} /> : null}
              </dl>
            </Panel>
            <Panel title="History" titleId="print-history" flush>
              <Timeline entries={timeline} />
            </Panel>
          </div>
          <Panel title="Cost" titleId="print-cost">
            {cost.complete ? (
              <dl className="flex flex-col divide-y divide-border text-md">
                <Fact label={`Filament · ${Number(usedGrams.toFixed(1))} g`} value={usd(cost.filament)} />
                <Fact label="Electricity" value={usd(cost.electricity)} />
                <Fact label="Machine wear" value={usd(cost.wear)} />
                {allowance ? <Fact label="Failure allowance" value={usd(allowance)} /> : null}
                {cost.wasteTotal > 0 ? <Fact label="Waste" value={usd(cost.wasteTotal)} /> : null}
                <Fact label="Job cost" value={usd(job.jobCostUsd ?? cost.total)} strong />
                <Fact label="Per piece" value={perPiece != null ? usd(perPiece) : "—"} />
              </dl>
            ) : (
              <p className="text-sm text-ink-muted">Cost incomplete: a price was missing when it finished.</p>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-3 py-2 font-bold" : "flex justify-between gap-3 py-2"}>
      <dt>{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}
