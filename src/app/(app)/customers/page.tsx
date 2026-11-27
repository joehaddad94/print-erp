import { Icon } from "@/components/shell/icons";
import {
  ColumnsMenu,
  DataTable,
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
import { formatPhone } from "@/lib/phone";
import { requireUser } from "@/server/auth/session";
import { listCustomers } from "@/server/orders/service";

type Row = Awaited<ReturnType<typeof listCustomers>>[number];
const dash = <span className="text-ink-muted">—</span>;
const owes = (c: Row) => c.balanceOwedUsd > 0.005;
const day = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Beirut" }) : null;

const columns: Column<Row>[] = [
  { key: "name", header: "Name", cell: (c) => c.name },
  { key: "phone", header: "Phone", cell: (c) => (c.phone ? formatPhone(c.phone) : dash) },
  {
    key: "owes",
    header: "Owes",
    numeric: true,
    cell: (c) =>
      owes(c) ? <span className="font-medium text-warning">{formatMoney(c.balanceOwedUsd, "USD")}</span> : dash,
  },
  { key: "orders", header: "Orders", numeric: true, cell: (c) => c.orderCount },
  { key: "last", header: "Last order", cell: (c) => day(c.lastOrderAt) ?? dash },
  { key: "area", header: "Area", cell: (c) => c.area ?? dash },
  { key: "email", header: "Email", truncate: true, cell: (c) => c.email ?? dash },
  { key: "handle", header: "Instagram", cell: (c) => c.handle ?? dash },
  { key: "address", header: "Address", truncate: true, cell: (c) => c.address ?? dash },
  {
    key: "map",
    header: "Map pin",
    cell: (c) =>
      c.mapUrl ? (
        <a
          href={c.mapUrl}
          target="_blank"
          rel="noreferrer"
          className="relative z-10 inline-flex min-h-6 items-center font-medium text-action hover:underline"
        >
          Open
        </a>
      ) : (
        dash
      ),
  },
  { key: "notes", header: "Notes", truncate: true, cell: (c) => c.notes ?? dash },
];

/** Customers (prototype /customers): search, All / Owes you, and a wide table you can trim. */
export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const show = sp.show === "owes" ? "owes" : undefined;
  const all = await listCustomers(db());
  const digits = q?.replace(/\D/g, "");
  const found = all.filter(
    (c) =>
      matches(q, c.name, c.email, c.handle, c.area) || (!!digits && digits.length >= 3 && !!c.phone?.includes(digits)),
  );
  const rows = show ? found.filter(owes) : found;
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
      {all.length === 0 ? (
        <EmptyState title="No customers yet">Add one here or from a new order.</EmptyState>
      ) : (
        <>
          <FilterBar
            base="/customers"
            q={q}
            param="show"
            current={show}
            placeholder="Search name, phone or email"
            right={
              <span className="hidden lg:block">
                <ColumnsMenu
                  tableId="customers"
                  bordered
                  pinned={["name"]}
                  columns={columns.map(({ key, header }) => ({ key, header }))}
                />
              </span>
            }
            options={[
              { key: "", label: "All", count: found.length },
              { key: "owes", label: "Owes you", count: found.filter(owes).length },
            ]}
          />
          <Panel title={show ? "Owe you" : "All customers"} titleId="customers-table" count={rows.length} flush>
            <DataTable
              id="customers"
              label="Customers"
              wide
              menuOutside
              columns={columns}
              rows={rows}
              rowKey={(c) => c.id}
              rowHref={(c) => `/customers/${c.id}`}
              empty={q ? `Nothing matches “${q}”.` : "Nobody owes you anything."}
              phoneRow={(c) => ({
                title: c.name,
                subtitle: [formatPhone(c.phone), c.area].filter(Boolean).join(" · ") || undefined,
                trailing: owes(c) ? (
                  <span className="text-warning">owes {formatMoney(c.balanceOwedUsd, "USD")}</span>
                ) : (
                  <span className="text-sm text-ink-muted">
                    {c.orderCount} order{c.orderCount === 1 ? "" : "s"}
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
