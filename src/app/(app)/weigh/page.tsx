import { and, asc, eq, isNull } from "drizzle-orm";
import { Link } from "@/components/ui/link";
import { WeighForm } from "@/components/printing/weigh-form";
import { Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { stockItems } from "@/db/schema";
import { requireUser } from "@/server/auth/session";
import { onHand } from "@/server/stock/ledger";

export default async function WeighPage() {
  await requireUser();
  const rows = await db()
    .select({ id: stockItems.id, name: stockItems.name, emptySpoolWeightG: stockItems.emptySpoolWeightG })
    .from(stockItems)
    .where(and(eq(stockItems.type, "filament"), isNull(stockItems.deletedAt)))
    .orderBy(asc(stockItems.name));
  const filaments = await Promise.all(rows.map(async (r) => ({ ...r, onHand: await onHand(db(), r.id) })));
  return (
    <div className="flex max-w-content flex-col gap-6">
      <PageHeader title="Weigh filament" />
      {filaments.length === 0 ? (
        <EmptyState title="No filament yet">
          <Link href="/expenses/new" className={buttonClass("primary")}>
            Add a filament purchase
          </Link>
        </EmptyState>
      ) : (
        <Card>
          <WeighForm filaments={filaments} />
        </Card>
      )}
    </div>
  );
}
