import { Link } from "@/components/ui/link";
import { OrderRows } from "@/components/orders/order-rows";
import { EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { cn } from "@/lib/cn";
import { requireUser } from "@/server/auth/session";
import { listOrders } from "@/server/orders/service";

type Row = Awaited<ReturnType<typeof listOrders>>[number];
const closed = (o: Row) => o.status === "delivered" || o.status === "cancelled";
const VIEWS = {
  open: { label: "Open", keep: (o: Row) => !closed(o) },
  unpaid: {
    label: "Unpaid",
    keep: (o: Row) => o.status !== "cancelled" && o.status !== "quoted" && o.balanceDueUsd > 0.005,
  },
  delivered: { label: "Delivered", keep: (o: Row) => o.status === "delivered" },
  all: { label: "All", keep: () => true },
} as const;
type View = keyof typeof VIEWS;

/** R4 Orders: Open by default, with Unpaid, Delivered and All one tap away. */
export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  await requireUser();
  const v = (await searchParams).view;
  const view: View = typeof v === "string" && v in VIEWS ? (v as View) : "open";
  const all = await listOrders(db());
  const rows = all.filter(VIEWS[view].keep);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Orders"
        action={
          <Link href="/orders/new" className={buttonClass("primary")}>
            New order
          </Link>
        }
      />
      <nav aria-label="Show" className="flex flex-wrap gap-1.5">
        {(Object.keys(VIEWS) as View[]).map((k) => (
          <Link
            key={k}
            href={k === "open" ? "/orders" : `/orders?view=${k}`}
            aria-current={view === k ? "page" : undefined}
            className={cn(
              "flex min-h-control min-w-tap items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-medium",
              view === k
                ? "border-ink bg-ink text-surface"
                : "border-border-strong bg-surface text-ink-soft hover:bg-surface-muted",
            )}
          >
            {VIEWS[k].label}
            {k === "open" || k === "unpaid" ? (
              <span className="tabular-nums opacity-75">{all.filter(VIEWS[k].keep).length}</span>
            ) : null}
          </Link>
        ))}
      </nav>
      {all.length === 0 ? (
        <EmptyState title="No orders yet">Orders from WhatsApp, Instagram or in person.</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title={`No ${VIEWS[view].label.toLowerCase()} orders`} />
      ) : (
        <OrderRows rows={rows} />
      )}
    </div>
  );
}
