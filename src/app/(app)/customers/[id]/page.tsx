import { notFound } from "next/navigation";
import { Icon } from "@/components/shell/icons";
import {
  Badge,
  DataTable,
  EmptyState,
  InlineDetails,
  PageHeader,
  Panel,
  StatStrip,
  buttonClass,
} from "@/components/ui";
import type { Column } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { formatMoney } from "@/lib/money";
import { formatPhone, whatsappUrl } from "@/lib/phone";
import { requireUser } from "@/server/auth/session";
import { updateCustomerFieldAction } from "@/server/orders/actions";
import { getCustomer, owesMoney, shownStatus } from "@/server/orders/service";
import { MapPinLink } from "@/components/ui/map-pin-link";

const usd = (n: number) => formatMoney(n, "USD");
const s = (v: string | null) => v ?? "";
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Beirut" });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

type Order = NonNullable<Awaited<ReturnType<typeof getCustomer>>>["orders"][number];
const tone = (o: Order) =>
  o.status === "delivered"
    ? "success"
    : o.status === "cancelled"
      ? "neutral"
      : o.status === "quoted"
        ? "neutral"
        : "info";
const needs = (o: Order) => o.needToPrint > 0 && !["quoted", "cancelled", "delivered"].includes(o.status);

/** Customer (prototype /customers/1): what they owe and bought, their orders, click-to-edit details. */
export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const c = Number.isInteger(id) ? await getCustomer(db(), id) : null;
  if (!c) notFound();
  const since = c.createdAt.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "Asia/Beirut" });
  const next = c.openOrders[0];
  const first = c.name.split(" ")[0];
  const columns: Column<Order>[] = [
    {
      key: "order",
      header: "Order",
      cell: (o) => `#${o.id}`,
    },
    { key: "date", header: "Date", cell: (o) => day(o.createdAt) },
    {
      key: "status",
      header: "Status",
      cell: (o) => (
        <span className="flex flex-wrap gap-1">
          <Badge tone={tone(o)}>{shownStatus(o)}</Badge>
          {needs(o) ? <Badge tone="danger">Need to print {o.needToPrint}</Badge> : null}
        </span>
      ),
    },
    { key: "total", header: "Total", numeric: true, cell: (o) => usd(o.totalUsd) },
    {
      key: "balance",
      header: "Balance",
      numeric: true,
      cell: (o) =>
        owesMoney(o) ? (
          <span className="font-semibold">{usd(o.balanceDueUsd)}</span>
        ) : (
          <span className="text-ink-muted">{usd(0)}</span>
        ),
    },
  ];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/customers", label: "Customers" }}
        title={c.name}
        description={[formatPhone(c.phone), `customer since ${since}`].filter(Boolean).join(" · ")}
        action={
          <div className="flex flex-wrap gap-2 *:flex-1 sm:*:flex-none">
            {c.phone ? (
              <a href={whatsappUrl(c.phone)} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                <Icon name="phone" size={15} />
                WhatsApp
              </a>
            ) : null}
            <Link href={`/orders/new?customer=${id}`} className={buttonClass("secondary")}>
              <Icon name="plus" size={15} />
              New order
            </Link>
          </div>
        }
      />
      <StatStrip
        items={[
          {
            label: "Owes you",
            value: usd(c.balanceOwedUsd),
            warn: c.balanceOwedUsd > 0.005,
            note: `on ${plural(c.owingOrders, "order")}`,
          },
          { label: "Delivered", value: usd(c.deliveredUsd), note: plural(c.deliveredCount, "order") },
          { label: `Profit from ${first}`, value: usd(c.profitUsd), note: "on delivered orders" },
          {
            label: "Open",
            value: String(c.openOrders.length),
            note: next ? `#${next.id}${next.dueOn ? ` · due ${next.dueOn}` : ""}` : "none",
          },
        ]}
      />
      <div className="grid items-start gap-5 lg:grid-aside">
        <Panel title="Orders" titleId="customer-orders" count={c.orders.length} flush>
          {c.orders.length ? (
            <DataTable
              id="customer-orders"
              label="Orders"
              columns={columns}
              rows={c.orders}
              rowKey={(o) => o.id}
              rowHref={(o) => `/orders/${o.id}`}
              phoneRow={(o) => ({
                title: `#${o.id} · ${day(o.createdAt)}`,
                trailing: owesMoney(o) ? `${usd(o.balanceDueUsd)} due` : usd(o.totalUsd),
                badge: <Badge tone={tone(o)}>{shownStatus(o)}</Badge>,
              })}
            />
          ) : (
            <EmptyState title="No orders yet" />
          )}
        </Panel>
        <Panel title="Details" titleId="customer-details">
          <InlineDetails
            save={updateCustomerFieldAction.bind(null, id)}
            rows={[
              { field: "name", label: "Name", value: c.name, wide: true },
              { field: "phone", label: "Phone", value: formatPhone(c.phone), inputMode: "tel", wide: true },
              { field: "email", label: "Email", value: s(c.email), inputMode: "email", wide: true },
              { field: "handle", label: "Instagram", note: "optional", value: s(c.handle), wide: true },
              { field: "area", label: "Area", value: s(c.area) },
              { field: "address", label: "Address", value: s(c.address), wide: true },
              {
                field: "mapUrl",
                label: "Map pin",
                value: s(c.mapUrl),
                display: "Change",
                wide: true,
                before: c.mapUrl ? <MapPinLink href={c.mapUrl} /> : null,
              },
              { field: "notes", label: "Notes", value: s(c.notes), wide: true },
            ]}
            footer="Click any value to change it. Every change is saved in History. Phone numbers are saved in one format: you can type 70123456, 070 123 456 or +961 70 123 456."
          />
        </Panel>
      </div>
    </div>
  );
}
