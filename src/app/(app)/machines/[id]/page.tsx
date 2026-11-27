import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/form/action-form";
import { CurrencyFields, NumberField, TextField, TextareaField } from "@/components/form/fields";
import { Badge, Callout, Card, HistoryList, PageHeader, Panel, Segmented } from "@/components/ui";
import { db } from "@/db";
import { expenses, suppliers } from "@/db/schema";
import { shortDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { historyFor } from "@/server/edits/engine";
import { saveMachineAction } from "@/server/machines/actions";
import { getMachine } from "@/server/machines/service";

const s = (v: unknown) => (v == null ? "" : String(v));

/** Machine (prototype /machines/1): what it is, what it cost, how long it lasts and what it draws. */
export default async function MachinePage({ params }: PageProps<"/machines/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const m = Number.isInteger(id) ? await getMachine(db(), id) : null;
  if (!m) notFound();
  const [history, [bought]] = await Promise.all([
    historyFor(db(), "machines", id),
    db()
      .select({
        spentOn: expenses.spentOn,
        amount: expenses.amount,
        currency: expenses.currency,
        supplier: suppliers.name,
      })
      .from(expenses)
      .leftJoin(suppliers, eq(suppliers.id, expenses.supplierId))
      .where(and(eq(expenses.machineId, id), isNull(expenses.deletedAt)))
      .orderBy(desc(expenses.spentOn))
      .limit(1),
  ]);
  const sub = bought
    ? `Bought ${shortDate(bought.spentOn)}${bought.supplier ? ` from ${bought.supplier}` : ""} · ${formatMoney(bought.amount, bought.currency)}`
    : [m.model, m.type === "printer" ? "printer" : "equipment"].filter(Boolean).join(" · ");
  return (
    <div className="flex max-w-content flex-col gap-5">
      <PageHeader
        back={{ href: "/machines", label: "Machines" }}
        title={m.name}
        badges={m.status === "active" ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Retired</Badge>}
        description={sub}
      />
      <Callout tone="info">Changes apply to prints started after you save.</Callout>
      <ActionForm
        action={saveMachineAction.bind(null, id)}
        submitLabel="Save machine"
        cancelHref="/machines"
        defaults={{
          name: m.name,
          model: s(m.model),
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
        <Card className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField name="name" label="Name" />
            <TextField name="model" label="Model" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Segmented
              name="type"
              legend="Type"
              defaultValue={m.type}
              options={[
                { value: "printer", label: "Printer" },
                { value: "equipment", label: "Equipment" },
              ]}
            />
            <Segmented
              name="status"
              legend="Status"
              defaultValue={m.status}
              options={[
                { value: "active", label: "Active" },
                { value: "retired", label: "Retired" },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <NumberField name="bedXMm" label="Bed X" suffix="mm" />
            <NumberField name="bedYMm" label="Bed Y" suffix="mm" />
            <NumberField name="nozzleMm" label="Nozzle" suffix="mm" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <NumberField
              name="purchaseAmount"
              label="Purchase cost"
              prefix={m.purchaseCurrency === "LBP" ? "LBP" : "$"}
            />
            <NumberField name="expectedLifeHours" label="Expected life" suffix="h" hint="Default 3,000 h." />
            <NumberField name="avgPowerKw" label="Average power" suffix="kW" hint="Ender-3 V3 SE: 0.12 kW." />
          </div>
          {m.purchaseCurrency === "LBP" ? <CurrencyFields /> : <input type="hidden" name="currency" value="USD" />}
          <TextareaField name="notes" label="Notes" optional />
        </Card>
      </ActionForm>
      <Panel title="History" titleId="machine-history">
        <HistoryList entries={history} />
      </Panel>
    </div>
  );
}
