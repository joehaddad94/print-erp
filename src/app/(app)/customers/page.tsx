import { ActionForm } from "@/components/form/action-form";
import { TextField } from "@/components/form/fields";
import { Card, EmptyState, List, ListRow, Money, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { saveCustomerAction } from "@/server/orders/actions";
import { listCustomers } from "@/server/orders/service";

export default async function CustomersPage() {
  await requireUser();
  const rows = await listCustomers(db());
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Customers" />
      {rows.length === 0 ? (
        <EmptyState title="No customers yet">Add one here or from a new order.</EmptyState>
      ) : (
        <List label="Customers">
          {rows.map((c) => (
            <ListRow
              key={c.id}
              href={`/customers/${c.id}`}
              title={c.name}
              subtitle={[c.phone, c.handle, `${c.orderCount} order${c.orderCount === 1 ? "" : "s"}`]
                .filter(Boolean)
                .join(" · ")}
              trailing={c.balanceOwedUsd > 0.005 ? <Money amount={c.balanceOwedUsd} /> : null}
            />
          ))}
        </List>
      )}
      <Card>
        <h2 className="pb-3 text-lg font-semibold">Add customer</h2>
        <ActionForm action={saveCustomerAction.bind(null, null)} submitLabel="Add customer">
          <TextField name="name" label="Name" />
          <div className="grid grid-cols-2 gap-3">
            <TextField name="phone" label="Phone" inputMode="tel" />
            <TextField name="handle" label="Instagram or other" />
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
