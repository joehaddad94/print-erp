import { Link } from "@/components/ui/link";
import { DataTable, EmptyState, Money, PageHeader, buttonClass, type Column } from "@/components/ui";
import { Icon } from "@/components/shell/icons";
import { db } from "@/db";
import { formatPhone } from "@/lib/phone";
import { requireUser } from "@/server/auth/session";
import { listCustomers } from "@/server/orders/service";

type Row = Awaited<ReturnType<typeof listCustomers>>[number];
const dash = <span className="text-ink-muted">—</span>;
const day = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Beirut" }) : null;

/** R5 Customers: a wide table on desktop (columns you can hide), rows on the phone. */
export default async function CustomersPage() {
  await requireUser();
  const rows = await listCustomers(db());
  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Name",
      cell: (c) => (
        <Link
          href={`/customers/${c.id}`}
          className="inline-flex min-h-6 items-center font-medium text-action hover:underline"
        >
          {c.name}
        </Link>
      ),
    },
    { key: "phone", header: "Phone", cell: (c) => (c.phone ? formatPhone(c.phone) : dash) },
    {
      key: "owes",
      header: "Owes",
      numeric: true,
      cell: (c) => (c.balanceOwedUsd > 0.005 ? <Money amount={c.balanceOwedUsd} /> : dash),
    },
    { key: "orders", header: "Orders", numeric: true, cell: (c) => c.orderCount },
    { key: "last", header: "Last order", lo: true, cell: (c) => day(c.lastOrderAt) ?? dash },
    { key: "area", header: "Area", lo: true, cell: (c) => c.area ?? dash },
    { key: "email", header: "Email", lo: true, truncate: true, cell: (c) => c.email ?? dash },
    { key: "handle", header: "Instagram", lo: true, cell: (c) => c.handle ?? dash },
  ];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Customers"
        action={
          <Link href="/customers/new" className={buttonClass("primary")}>
            <Icon name="plus" size={15} />
            Add customer
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No customers yet">Add one here or from a new order.</EmptyState>
      ) : (
        <DataTable
          id="customers"
          label="Customers"
          wide
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          phoneRow={(c) => ({
            href: `/customers/${c.id}`,
            title: c.name,
            subtitle: [formatPhone(c.phone), c.area, `${c.orderCount} order${c.orderCount === 1 ? "" : "s"}`]
              .filter(Boolean)
              .join(" · "),
            trailing: c.balanceOwedUsd > 0.005 ? <Money amount={c.balanceOwedUsd} /> : null,
          })}
        />
      )}
    </div>
  );
}
