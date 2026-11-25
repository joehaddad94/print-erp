import { notFound } from "next/navigation";
import { ActionForm } from "@/components/form/action-form";
import { TextareaField, TextField } from "@/components/form/fields";
import { OrderRows } from "@/components/orders/order-rows";
import { Card, EmptyState, HistoryList, Money, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { historyFor } from "@/server/edits/engine";
import { saveCustomerAction } from "@/server/orders/actions";
import { getCustomer } from "@/server/orders/service";

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const c = Number.isInteger(id) ? await getCustomer(db(), id) : null;
  if (!c) notFound();
  const history = await historyFor(db(), "customers", id);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={c.name} />
      <Card className="flex items-center justify-between gap-3">
        <span className="text-sm">Balance owed</span>
        <Money amount={c.balanceOwedUsd} />
      </Card>
      <section aria-labelledby="customer-orders" className="flex flex-col gap-2">
        <h2 id="customer-orders" className="text-lg font-bold">
          Orders
        </h2>
        {c.orders.length ? <OrderRows rows={c.orders} /> : <EmptyState title="No orders yet" />}
      </section>
      <Card>
        <ActionForm
          action={saveCustomerAction.bind(null, id)}
          submitLabel="Save customer"
          defaults={{ name: c.name, phone: c.phone ?? "", handle: c.handle ?? "", notes: c.notes ?? "" }}
        >
          <TextField name="name" label="Name" />
          <div className="grid grid-cols-2 gap-3">
            <TextField name="phone" label="Phone" inputMode="tel" />
            <TextField name="handle" label="Instagram or other" />
          </div>
          <TextareaField name="notes" label="Notes" />
        </ActionForm>
      </Card>
      <section aria-labelledby="customer-history" className="flex flex-col gap-2">
        <h2 id="customer-history" className="text-lg font-bold">
          History
        </h2>
        <HistoryList entries={history} />
      </section>
    </div>
  );
}
