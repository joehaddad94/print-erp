import { notFound } from "next/navigation";
import { ActionForm } from "@/components/form/action-form";
import { CurrencyFields, NumberField, SelectField, TextField, TextareaField } from "@/components/form/fields";
import { Card, HistoryList, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { historyFor } from "@/server/edits/engine";
import { saveMachineAction } from "@/server/machines/actions";
import { getMachine } from "@/server/machines/service";

const s = (v: unknown) => (v == null ? "" : String(v));

export default async function MachinePage({ params }: PageProps<"/machines/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const m = Number.isInteger(id) ? await getMachine(db(), id) : null;
  if (!m) notFound();
  const history = await historyFor(db(), "machines", id);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={m.name} />
      <Card>
        <ActionForm
          action={saveMachineAction.bind(null, id)}
          submitLabel="Save machine"
          defaults={{
            name: m.name,
            model: s(m.model),
            type: m.type,
            status: m.status,
            purchaseAmount: s(m.purchaseAmount),
            currency: m.purchaseCurrency,
            lbpRate: m.purchaseCurrency === "LBP" ? s(Math.round(1 / m.purchaseRateToUsd)) : "",
            expectedLifeHours: s(m.expectedLifeHours),
            avgPowerKw: s(m.avgPowerKw),
            nozzleMm: s(m.nozzleMm),
            bedXMm: s(m.bedXMm),
            bedYMm: s(m.bedYMm),
            notes: s(m.notes),
          }}
        >
          <TextField name="name" label="Name" />
          <TextField name="model" label="Model" />
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              name="type"
              label="Type"
              options={[
                { value: "printer", label: "Printer" },
                { value: "equipment", label: "Equipment" },
              ]}
            />
            <SelectField
              name="status"
              label="Status"
              options={[
                { value: "active", label: "Active" },
                { value: "retired", label: "Retired" },
              ]}
            />
          </div>
          <NumberField name="purchaseAmount" label="Purchase cost" />
          <CurrencyFields />
          <NumberField name="expectedLifeHours" label="Expected life" suffix="hours" hint="Default 3,000 h (D27)." />
          <NumberField name="avgPowerKw" label="Average power" suffix="kW" hint="Ender-3 V3 SE: 0.12 kW." />
          <div className="grid grid-cols-3 gap-3">
            <NumberField name="nozzleMm" label="Nozzle (mm)" />
            <NumberField name="bedXMm" label="Bed X (mm)" />
            <NumberField name="bedYMm" label="Bed Y (mm)" />
          </div>
          <TextareaField name="notes" label="Notes" />
          <p className="text-xs text-ink-muted">Changes apply to prints started after you save.</p>
        </ActionForm>
      </Card>
      <section aria-labelledby="machine-history" className="flex flex-col gap-2">
        <h2 id="machine-history" className="text-lg font-bold">
          History
        </h2>
        <HistoryList entries={history} />
      </section>
    </div>
  );
}
