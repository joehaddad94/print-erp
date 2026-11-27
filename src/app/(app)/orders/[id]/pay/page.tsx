import { notFound } from "next/navigation";
import { ActionForm } from "@/components/form/action-form";
import { CurrencyFields, DateField, NumberField, SelectField, TextField } from "@/components/form/fields";
import { METHODS } from "@/components/orders/labels";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { recordPaymentAction } from "@/server/orders/actions";
import { getOrder } from "@/server/orders/service";
import { orderFormOptions } from "../../options";

/** Record payment (prototype /orders/1042/pay): amount pre-filled with the balance due. */
export default async function RecordPaymentPage({ params }: PageProps<"/orders/[id]/pay">) {
  await requireUser();
  const id = Number((await params).id);
  const o = Number.isInteger(id) ? await getOrder(db(), id) : null;
  if (!o || o.status === "cancelled") notFound();
  const opts = await orderFormOptions();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
  const due = o.balance.balanceDueUsd;
  // Pre-fill in the order's currency so a USD order asks for dollars and an LBP order for pounds.
  const amount = due > 0.005 ? (o.currency === "LBP" ? Math.round(due / o.rateToUsd) : Number(due.toFixed(2))) : "";
  return (
    <div className="flex max-w-content flex-col gap-5">
      <PageHeader
        back={{ href: `/orders/${id}`, label: `Order #${id}` }}
        title="Record payment"
        description={[o.customer?.name, `balance due ${formatMoney(due, "USD")}`].filter(Boolean).join(" · ")}
      />
      <ActionForm
        action={recordPaymentAction.bind(null, id)}
        submitLabel="Record payment"
        cancelHref={`/orders/${id}`}
        defaults={{
          amount: String(amount),
          paidOn: today,
          currency: o.currency,
          method: "cash",
          lbpRate: o.currency === "LBP" ? String(Math.round(1 / o.rateToUsd)) : (opts.lbpRate ?? ""),
        }}
      >
        <Card className="flex flex-col gap-4">
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <NumberField name="amount" label="Amount" hint="Negative for a refund." />
            <DateField name="paidOn" label="Date" />
          </div>
          <CurrencyFields lbpRateDefault={opts.lbpRate} />
          <SelectField name="method" label="Method" options={METHODS} />
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <TextField name="collectedBy" label="Collected by" optional />
            <TextField name="reference" label="Reference" optional />
          </div>
        </Card>
      </ActionForm>
    </div>
  );
}
