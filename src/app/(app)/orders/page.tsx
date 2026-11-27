import { Icon } from "@/components/shell/icons";
import {
  Badge,
  DataTable,
  EditedMarker,
  EmptyState,
  FilterBar,
  PageHeader,
  Panel,
  buttonClass,
  matches,
  type Column,
} from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { PAYMENT_STATE_LABELS, listOrders, shownStatus } from "@/server/orders/service";

type Row = Awaited<ReturnType<typeof listOrders>>[number];
const closed = (o: Row) => o.status === "delivered" || o.status === "cancelled";
const VIEWS = {
  open: { label: "Open", title: "Open orders", keep: (o: Row) => !closed(o) },
  unpaid: {
    label: "Unpaid",
    title: "Unpaid orders",
    keep: (o: Row) => o.status !== "cancelled" && o.status !== "quoted" && o.balanceDueUsd > 0.005,
  },
  delivered: { label: "Delivered", title: "Delivered orders", keep: (o: Row) => o.status === "delivered" },
  all: { label: "All", title: "All orders", keep: () => true },
} as const;
type View = keyof typeof VIEWS;

const usd = (n: number) => formatMoney(n, "USD");
const payTone = { unpaid: "warning", partly_paid: "info", paid: "success" } as const;
const statusTone = (o: Row) =>
  o.status === "delivered" ? "success" : o.status === "cancelled" || o.status === "quoted" ? "neutral" : "info";
const needs = (o: Row) => o.needToPrint > 0 && !["quoted", "cancelled", "delivered"].includes(o.status);
const due = (o: Row) =>
  o.dueOn
    ? new Date(`${o.dueOn}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    : "—";
const owes = (o: Row) => o.status !== "cancelled" && o.balanceDueUsd > 0.005;

const columns: Column<Row>[] = [
  {
    key: "order",
    header: "Order",
    cell: (o) => (
      <span className="flex min-w-8 items-center gap-1.5">
        #{o.id}
        <EditedMarker at={o.editedAt} compact />
      </span>
    ),
  },
  { key: "customer", header: "Customer", cell: (o) => o.customerName ?? "No customer" },
  { key: "items", header: "Items", lo: true, truncate: true, cell: (o) => o.itemsText ?? "—" },
  { key: "due", header: "Due", cell: due },
  {
    key: "status",
    header: "Status",
    cell: (o) => (
      <span className="flex flex-wrap gap-1">
        <Badge tone={statusTone(o)}>{shownStatus(o)}</Badge>
        {needs(o) ? <Badge tone="danger">Need to print {o.needToPrint}</Badge> : null}
      </span>
    ),
  },
  {
    key: "payment",
    header: "Payment",
    cell: (o) =>
      o.status === "cancelled" ? null : (
        <Badge tone={payTone[o.paymentState]}>{PAYMENT_STATE_LABELS[o.paymentState]}</Badge>
      ),
  },
  { key: "total", header: "Total", numeric: true, cell: (o) => usd(o.totalUsd) },
  {
    key: "balance",
    header: "Balance",
    numeric: true,
    cell: (o) =>
      owes(o) ? (
        <span className="font-semibold">{usd(o.balanceDueUsd)}</span>
      ) : (
        <span className="text-ink-muted">{usd(0)}</span>
      ),
  },
];

/** Orders (prototype /orders): Open by default, with Unpaid, Delivered and All, and a search. */
export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  await requireUser();
  const sp = await searchParams;
  const view: View = typeof sp.view === "string" && sp.view in VIEWS ? (sp.view as View) : "open";
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const all = await listOrders(db());
  const found = all.filter((o) => matches(q?.replace(/^#/, ""), String(o.id), o.customerName, o.itemsText));
  const rows = found.filter(VIEWS[view].keep);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Orders"
        action={
          <Link href="/orders/new" className={buttonClass("primary")}>
            <Icon name="plus" size={15} />
            New order
          </Link>
        }
      />
      {all.length === 0 ? (
        <EmptyState title="No orders yet">Orders from WhatsApp, Instagram or in person.</EmptyState>
      ) : (
        <>
          <FilterBar
            base="/orders"
            q={q}
            param="view"
            current={view === "open" ? "" : view}
            placeholder="Search customer or order #"
            options={(Object.keys(VIEWS) as View[]).map((k) => ({
              key: k === "open" ? "" : k,
              label: VIEWS[k].label,
              count: k === "open" || k === "unpaid" ? found.filter(VIEWS[k].keep).length : undefined,
            }))}
          />
          <Panel title={VIEWS[view].title} titleId="orders-table" count={rows.length} flush>
            <DataTable
              id="orders"
              label="Orders"
              columns={columns}
              rows={rows}
              rowKey={(o) => o.id}
              rowHref={(o) => `/orders/${o.id}`}
              empty={q ? `Nothing matches “${q}”.` : `No ${VIEWS[view].label.toLowerCase()} orders.`}
              phoneRow={(o) => ({
                title: `#${o.id} · ${o.customerName ?? "No customer"}`,
                badge: o.editedAt ? <EditedMarker at={o.editedAt} /> : undefined,
                subtitle: [o.itemsText, o.dueOn ? `due ${due(o)}` : null].filter(Boolean).join(" · ") || undefined,
                trailing: (
                  <span className="flex flex-col items-end gap-1">
                    <span>{owes(o) ? `${usd(o.balanceDueUsd)} due` : usd(o.totalUsd)}</span>
                    {needs(o) ? (
                      <Badge tone="danger">Need to print {o.needToPrint}</Badge>
                    ) : (
                      <Badge tone={statusTone(o)}>{shownStatus(o)}</Badge>
                    )}
                  </span>
                ),
              })}
            />
          </Panel>
        </>
      )}
    </div>
  );
}
