import { Icon } from "@/components/shell/icons";
import { DataTable, EmptyState, Money, PageHeader, Panel, buttonClass, type Column } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { formatPhone } from "@/lib/phone";
import { requireUser } from "@/server/auth/session";
import { listSuppliers } from "@/server/suppliers/service";

type Row = Awaited<ReturnType<typeof listSuppliers>>[number];

/** R7 suppliers: who you buy from, what they sell, what you spent. */
export default async function SuppliersPage() {
  await requireUser();
  const rows = await listSuppliers(db());
  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Name",
      cell: (s) => s.name,
    },
    { key: "sells", header: "Sells", lo: true, cell: (s) => s.sells ?? "—" },
    { key: "phone", header: "Phone", lo: true, cell: (s) => formatPhone(s.phone) || s.contact || "—" },
    { key: "area", header: "Area", lo: true, cell: (s) => s.area ?? "—" },
    { key: "count", header: "Purchases", numeric: true, cell: (s) => s.purchaseCount },
    { key: "last", header: "Last purchase", lo: true, cell: (s) => s.lastPurchase ?? "—" },
    { key: "spent", header: "Spent", numeric: true, cell: (s) => <Money amount={s.totalUsd} /> },
  ];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Suppliers"
        description="The shops you buy filament, packaging and machines from."
        action={
          <Link href="/suppliers/new" className={buttonClass("primary")}>
            <Icon name="plus" size={15} />
            Add supplier
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No suppliers yet">Add the shops you buy filament and packaging from.</EmptyState>
      ) : (
        <Panel title="Suppliers" titleId="suppliers" count={rows.length} flush>
          <DataTable
            id="suppliers"
            label="Suppliers"
            wide
            columns={columns}
            rows={rows}
            rowKey={(s) => s.id}
            rowHref={(s) => `/suppliers/${s.id}`}
            phoneRow={(s) => ({
              title: s.name,
              subtitle: [s.sells, formatPhone(s.phone) || s.contact, s.area].filter(Boolean).join(" · ") || undefined,
              trailing: <Money amount={s.totalUsd} />,
            })}
          />
        </Panel>
      )}
    </div>
  );
}
