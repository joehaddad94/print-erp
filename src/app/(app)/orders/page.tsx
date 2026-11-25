import { Link } from "@/components/ui/link";
import { OrderRows } from "@/components/orders/order-rows";
import { EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { listOrders } from "@/server/orders/service";

export default async function OrdersPage() {
  await requireUser();
  const rows = await listOrders(db());
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Orders"
        action={
          <Link href="/orders/new" className={buttonClass("primary")}>
            New order
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No orders yet">Orders from WhatsApp, Instagram or in person.</EmptyState>
      ) : (
        <OrderRows rows={rows} />
      )}
    </div>
  );
}
