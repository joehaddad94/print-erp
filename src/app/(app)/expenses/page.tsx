import Link from "next/link";
import { Badge, EditedMarker, EmptyState, List, ListRow, Money, PageHeader, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { CATEGORY_LABELS } from "@/server/expenses/schema";
import { listExpenses } from "@/server/expenses/service";

export default async function ExpensesPage() {
  await requireUser();
  const rows = await listExpenses(db());
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Expenses & purchases"
        action={
          <Link href="/expenses/new" className={buttonClass("primary")}>
            Add expense
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No expenses yet">Filament, packaging and machine purchases also add stock.</EmptyState>
      ) : (
        <List label="Expenses">
          {rows.map((e) => (
            <ListRow
              key={e.id}
              href={`/expenses/${e.id}`}
              title={e.boughtName ?? CATEGORY_LABELS[e.category]}
              subtitle={[e.spentOn, CATEGORY_LABELS[e.category], e.supplierName].filter(Boolean).join(" · ")}
              trailing={<Money amount={e.amount} currency={e.currency} rateToUsd={e.rateToUsd} />}
              badge={
                <span className="flex flex-wrap gap-1">
                  <Badge tone={e.isPurchase ? "info" : "neutral"}>{e.isPurchase ? "Purchase" : "Bill"}</Badge>
                  <EditedMarker at={e.editedAt} />
                </span>
              }
            />
          ))}
        </List>
      )}
    </div>
  );
}
