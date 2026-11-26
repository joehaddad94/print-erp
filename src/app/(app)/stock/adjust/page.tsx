import { asc, isNull } from "drizzle-orm";
import { AdjustForm } from "@/components/stock/adjust-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { stockItems } from "@/db/schema";
import { requireOwner } from "@/server/auth/session";
import { ADJUST_REASONS } from "@/server/stock/adjust";
import { onHand } from "@/server/stock/ledger";

/** R6 Adjust stock (owner only). Replaces Weigh filament. */
export default async function AdjustStockPage() {
  await requireOwner();
  const rows = await db()
    .select({
      id: stockItems.id,
      name: stockItems.name,
      type: stockItems.type,
      unit: stockItems.unit,
      emptySpoolWeightG: stockItems.emptySpoolWeightG,
    })
    .from(stockItems)
    .where(isNull(stockItems.deletedAt))
    .orderBy(asc(stockItems.name));
  const items = await Promise.all(rows.map(async (r) => ({ ...r, onHand: await onHand(db(), r.id) })));
  return (
    <div className="flex max-w-content flex-col gap-5">
      <PageHeader
        back={{ href: "/stock", label: "Stock" }}
        title="Adjust stock"
        badges={<Badge>Owner only</Badge>}
        description="Correct what the app thinks you have. Every adjustment needs a reason and shows in Change history."
      />
      <Card>
        <AdjustForm items={items} reasons={ADJUST_REASONS} />
      </Card>
    </div>
  );
}
