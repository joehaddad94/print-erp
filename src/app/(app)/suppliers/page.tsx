import { ActionForm } from "@/components/form/action-form";
import { TextField } from "@/components/form/fields";
import { Card, EmptyState, List, ListRow, Money, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { saveSupplierAction } from "@/server/suppliers/actions";
import { listSuppliers } from "@/server/suppliers/service";

export default async function SuppliersPage() {
  await requireUser();
  const rows = await listSuppliers(db());
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Suppliers" />
      {rows.length === 0 ? (
        <EmptyState title="No suppliers yet">Add the shops you buy filament and packaging from.</EmptyState>
      ) : (
        <List label="Suppliers">
          {rows.map((s) => (
            <ListRow
              key={s.id}
              href={`/suppliers/${s.id}`}
              title={s.name}
              subtitle={s.contact ?? undefined}
              trailing={
                <span className="text-sm">
                  <Money amount={s.totalUsd} />
                  <span className="block text-xs text-ink-muted">total spent</span>
                </span>
              }
            />
          ))}
        </List>
      )}
      <Card>
        <h2 className="pb-3 text-lg font-bold">Add a supplier</h2>
        <ActionForm action={saveSupplierAction.bind(null, null)} submitLabel="Add supplier">
          <TextField name="name" label="Name" />
          <TextField name="contact" label="Phone or link" />
        </ActionForm>
      </Card>
    </div>
  );
}
