import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/form/action-form";
import { TextField, TextareaField } from "@/components/form/fields";
import { Card, HistoryList, List, ListRow, Money, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { expenses, suppliers } from "@/db/schema";
import { requireUser } from "@/server/auth/session";
import { historyFor } from "@/server/edits/engine";
import { CATEGORY_LABELS } from "@/server/expenses/schema";
import { saveSupplierAction } from "@/server/suppliers/actions";

export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [s] = await db()
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)));
  if (!s) notFound();
  const bought = await db()
    .select()
    .from(expenses)
    .where(and(eq(expenses.supplierId, id), isNull(expenses.deletedAt)))
    .orderBy(desc(expenses.spentOn));
  const total = bought.reduce((sum, e) => sum + e.amount * e.rateToUsd, 0);
  const history = await historyFor(db(), "suppliers", id);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={s.name} />
      <Card>
        <ActionForm
          action={saveSupplierAction.bind(null, id)}
          submitLabel="Save supplier"
          defaults={{ name: s.name, contact: s.contact ?? "", notes: s.notes ?? "" }}
        >
          <TextField name="name" label="Name" />
          <TextField name="contact" label="Phone or link" />
          <TextareaField name="notes" label="Notes" />
        </ActionForm>
      </Card>
      <section aria-labelledby="supplier-bought" className="flex flex-col gap-2">
        <h2 id="supplier-bought" className="text-lg font-bold">
          Bought: <Money amount={total} />
        </h2>
        {bought.length ? (
          <List label="Purchases">
            {bought.map((e) => (
              <ListRow
                key={e.id}
                href={`/expenses/${e.id}`}
                title={CATEGORY_LABELS[e.category]}
                subtitle={e.spentOn}
                trailing={<Money amount={e.amount} currency={e.currency} rateToUsd={e.rateToUsd} />}
              />
            ))}
          </List>
        ) : (
          <p className="text-sm text-ink-muted">Nothing bought from this supplier yet.</p>
        )}
      </section>
      <section aria-labelledby="supplier-history" className="flex flex-col gap-2">
        <h2 id="supplier-history" className="text-lg font-bold">
          History
        </h2>
        <HistoryList entries={history} />
      </section>
    </div>
  );
}
