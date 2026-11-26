import { notFound } from "next/navigation";
import { FinishForm, type FinishDefaults } from "@/components/printing/finish-form";
import { Badge, HistoryList, PageHeader, Panel, formatWhen } from "@/components/ui";
import { formatDuration } from "@/lib/format";
import { db } from "@/db";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { historyFor } from "@/server/edits/engine";
import { editPrintAction, finishPrintAction } from "@/server/printing/actions";
import { getJob, jobForFinish } from "@/server/printing/service";
import { productLabel } from "@/server/products/service";

const s = (v: number | null | undefined) => (v == null ? "" : String(Number(v.toFixed(3))));

export default async function PrintJobPage({ params }: PageProps<"/print/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const job = Number.isInteger(id) ? await getJob(db(), id) : null;
  if (!job) notFound();
  const finished = job.finishedAt != null;
  const estimateHours = job.estimatedSeconds != null ? job.estimatedSeconds / 3600 : null;
  const items = job.items.map((i) => ({
    id: i.line.id,
    name: productLabel({ name: i.productName, variant: i.productVariant }),
    qtyPlanned: i.line.qtyPlanned,
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
    />
  );
  const started = `${job.machine.name} · started ${formatWhen(job.startedAt)}`;
  if (!finished)
    return (
      <div className="flex flex-col gap-5">
        <PageHeader
          back={{ href: "/", label: "Today" }}
          title={`Finish print: ${job.recipe.name}`}
          badges={<Badge tone="info">Printing now</Badge>}
          description={started}
        />
        {form}
      </div>
    );

  const good = job.items.reduce((n, i) => n + (i.line.qtyGood ?? 0), 0);
  const planned = job.items.reduce((n, i) => n + i.line.qtyPlanned, 0);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/", label: "Today" }}
        title={`Print: ${job.recipe.name}`}
        badges={
          <>
            {(job.stoppedAtPct ?? 100) < 100 ? (
              <Badge tone="warning">Stopped at {Number(job.stoppedAtPct)}%</Badge>
            ) : (
              <Badge tone="success">Ran to the end</Badge>
            )}
            {estimated ? <Badge tone="estimated">Estimated grams</Badge> : <Badge tone="success">Weighed</Badge>}
          </>
        }
        description={`${started} · finished ${formatWhen(job.finishedAt!)}`}
      />
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        <Fact label="Job cost" value={formatMoney(job.jobCostUsd ?? 0, "USD")} />
        <Fact label="Waste" value={formatMoney(job.wasteCostUsd ?? 0, "USD")} />
        <Fact label="Good pieces" value={`${good} of ${planned}`} />
        <Fact label="Print time" value={formatDuration((job.hours ?? 0) * 3600)} />
      </dl>
      <Panel title="Edit this print" titleId="print-edit">
        {form}
      </Panel>
      <Panel title="History" titleId="print-history">
        <HistoryList entries={history} />
      </Panel>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-surface px-4 py-3">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
