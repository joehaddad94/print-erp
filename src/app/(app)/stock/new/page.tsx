import { NewStockItemForm } from "@/components/stock/new-stock-item-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";

/** New stock item (prototype /stock/new). */
export default async function NewStockItemPage() {
  await requireUser();
  return (
    <div className="flex max-w-content flex-col gap-5">
      <PageHeader
        back={{ href: "/stock", label: "Stock" }}
        title="New stock item"
        description="For something you already have, or will buy. Printed products appear in stock by themselves."
      />
      <NewStockItemForm />
    </div>
  );
}
