import { notFound } from "next/navigation";
import { ActionForm } from "@/components/form/action-form";
import { CustomerFields } from "@/components/customers/customer-fields";
import { OrderRows } from "@/components/orders/order-rows";
import { Icon } from "@/components/shell/icons";
import { EmptyState, HistoryList, PageHeader, Panel, buttonClass } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { formatPhone, whatsappUrl } from "@/lib/phone";
import { requireUser } from "@/server/auth/session";
import { historyFor } from "@/server/edits/engine";
import { saveCustomerAction } from "@/server/orders/actions";
import { getCustomer } from "@/server/orders/service";

const usd = (n: number) => formatMoney(n, "USD");
const s = (v: string | null) => v ?? "";

/** R5 customer: what they owe and bought at a glance, their orders, details, history. */
export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const c = Number.isInteger(id) ? await getCustomer(db(), id) : null;
  if (!c) notFound();
  const history = await historyFor(db(), "customers", id);
  const since = c.createdAt.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "Asia/Beirut" });
  const next = c.openOrders[0];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/customers", label: "Customers" }}
        title={c.name}
        description={[formatPhone(c.phone), `customer since ${since}`].filter(Boolean).join(" · ")}
        action={
          <div className="flex flex-wrap gap-2">
            {c.phone ? (
              <a href={whatsappUrl(c.phone)} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                <Icon name="phone" size={15} />
                WhatsApp
              </a>
            ) : null}
            <Link href="/orders/new" className={buttonClass("secondary")}>
              <Icon name="plus" size={15} />
              New order
            </Link>
          </div>
        }
      />
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        <Stat label="Balance owed" value={usd(c.balanceOwedUsd)} warn={c.balanceOwedUsd > 0.005}>
          on {c.owingOrders} order{c.owingOrders === 1 ? "" : "s"}
        </Stat>
        <Stat label="Delivered" value={usd(c.deliveredUsd)}>
          {c.deliveredCount} order{c.deliveredCount === 1 ? "" : "s"}
        </Stat>
        <Stat label="Profit from them" value={usd(c.profitUsd)}>
          on delivered orders
        </Stat>
        <Stat label="Open" value={String(c.openOrders.length)}>
          {next ? `#${next.id}${next.dueOn ? ` · due ${next.dueOn}` : ""}` : "none"}
        </Stat>
      </dl>
      <div className="grid items-start gap-5 lg:grid-aside">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Orders" titleId="customer-orders" count={c.orders.length} flush>
            {c.orders.length ? <OrderRows rows={c.orders} /> : <EmptyState title="No orders yet" />}
          </Panel>
          <Panel title="History" titleId="customer-history">
            <HistoryList entries={history} />
          </Panel>
        </div>
        <Panel title="Details" titleId="customer-details">
          {c.mapUrl ? (
            <a
              href={c.mapUrl}
              target="_blank"
              rel="noreferrer"
              className="mb-3 inline-flex min-h-control items-center gap-1.5 text-sm font-medium text-action hover:underline"
            >
              <Icon name="pin" size={14} />
              Open map pin
            </a>
          ) : null}
          <ActionForm
            action={saveCustomerAction.bind(null, id)}
            submitLabel="Save customer"
            defaults={{
              name: c.name,
              phone: formatPhone(c.phone),
              email: s(c.email),
              handle: s(c.handle),
              area: s(c.area),
              address: s(c.address),
              mapUrl: s(c.mapUrl),
              notes: s(c.notes),
            }}
          >
            <CustomerFields />
          </ActionForm>
        </Panel>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
  children,
}: {
  label: string;
  value: string;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-surface px-4 py-3">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className={cn("text-2xl font-semibold tabular-nums", warn && "text-warning")}>{value}</dd>
      <dd className="text-xs text-ink-muted">{children}</dd>
    </div>
  );
}
