import { notFound } from "next/navigation";
import { FinishForm, type FinishDefaults } from "@/components/printing/finish-form";
import { Badge, Card, HistoryList, PageHeader, formatWhen } from "@/components/ui";
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
  const filaments = job.filaments.map((f) => ({ id: f.line.id, name: f.name }));
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
  return (
    <div className="flex max-w-content flex-col gap-6">
      <PageHeader title={`${finished ? "Print" : "Finish print"}: ${job.recipe.name}`} />
      <Card className="flex flex-col gap-1 text-sm">
        <p>
          <span className="font-semibold">{job.machine.name}</span> · started {formatWhen(job.startedAt)}
          {finished ? ` · finished ${formatWhen(job.finishedAt!)}` : ""}
        </p>
        {finished ? (
          <p className="flex flex-wrap items-center gap-2">
            Job cost <span className="font-bold">{formatMoney(job.jobCostUsd ?? 0, "USD")}</span>
            {job.wasteCostUsd ? <span>· waste {formatMoney(job.wasteCostUsd, "USD")}</span> : null}
            {estimated ? <Badge tone="estimated">Estimated grams</Badge> : <Badge tone="success">Weighed</Badge>}
          </p>
        ) : (
          <Badge tone="info">Printing now</Badge>
        )}
      </Card>
      <Card>
        {finished ? <h2 className="pb-3 text-lg font-bold">Edit this print</h2> : null}
        <FinishForm
          action={(finished ? editPrintAction : finishPrintAction).bind(null, id)}
          job={jobForFinish(job)}
          estimateHours={estimateHours}
          items={items}
          filaments={filaments}
          defaults={defaults}
          submitLabel={finished ? "Save changes" : "Save and add to stock"}
        />
      </Card>
      {finished ? (
        <section aria-labelledby="print-history" className="flex flex-col gap-2">
          <h2 id="print-history" className="text-lg font-bold">
            History
          </h2>
          <HistoryList entries={history} />
        </section>
      ) : null}
    </div>
  );
}
