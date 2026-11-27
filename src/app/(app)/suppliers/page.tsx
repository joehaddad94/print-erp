import { Icon } from "@/components/shell/icons";
import {
  ColumnsMenu,
  DataTable,
  EmptyState,
  FilterBar,
  Money,
  PageHeader,
  Panel,
  buttonClass,
  matches,
  type Column,
} from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { formatPhone } from "@/lib/phone";
import { requireUser } from "@/server/auth/session";
import { listSuppliers } from "@/server/suppliers/service";

type Row = Awaited<ReturnType<typeof listSuppliers>>[number];
const dash = <span className="text-ink-muted">—</span>;
const day = (iso: string | null) =>
  iso
    ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    : null;

const columns: Column<Row>[] = [
  { key: "name", header: "Name", cell: (s) => s.name },
  { key: "phone", header: "Phone", cell: (s) => formatPhone(s.phone) || s.contact || dash },
  { key: "sells", header: "Sells", cell: (s) => s.sells ?? dash },
  { key: "spent", header: "Spent", numeric: true, cell: (s) => <Money amount={s.totalUsd} /> },
  { key: "count", header: "Purchases", numeric: true, cell: (s) => s.purchaseCount },
  { key: "last", header: "Last purchase", cell: (s) => day(s.lastPurchase) ?? dash },
  { key: "area", header: "Area", cell: (s) => s.area ?? dash },
  { key: "email", header: "Email", truncate: true, cell: (s) => s.email ?? dash },
  { key: "website", header: "Website or Instagram", truncate: true, cell: (s) => s.website ?? dash },
  { key: "address", header: "Address", truncate: true, cell: (s) => s.address ?? dash },
  {
    key: "map",
    header: "Map pin",
    cell: (s) =>
      s.mapUrl ? (
        <a
          href={s.mapUrl}
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
  { key: "notes", header: "Notes", truncate: true, cell: (s) => s.notes ?? dash },
];

/** Suppliers (prototype /suppliers): who you buy from, a search, and a wide table you can trim. */
export default async function SuppliersPage({ searchParams }: PageProps<"/suppliers">) {
  await requireUser();
  const q = (await searchParams).q;
  const query = typeof q === "string" ? q : undefined;
  const all = await listSuppliers(db());
  const digits = query?.replace(/\D/g, "");
  const rows = all.filter(
    (s) =>
      matches(query, s.name, s.sells, s.contact, s.area, s.email) ||
      (!!digits && digits.length >= 3 && !!s.phone?.includes(digits)),
  );
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
      {all.length === 0 ? (
        <EmptyState title="No suppliers yet">Add the shops you buy filament and packaging from.</EmptyState>
      ) : (
        <>
          <FilterBar
            base="/suppliers"
            q={query}
            options={[]}
            placeholder="Search name, phone or what they sell"
            right={
              <span className="hidden lg:block">
                <ColumnsMenu
                  tableId="suppliers"
                  bordered
                  pinned={["name"]}
                  columns={columns.map(({ key, header }) => ({ key, header }))}
                />
              </span>
            }
          />
          <Panel title="All suppliers" titleId="suppliers" count={rows.length} flush>
            <DataTable
              id="suppliers"
              label="Suppliers"
              wide
              menuOutside
              columns={columns}
              rows={rows}
              rowKey={(s) => s.id}
              rowHref={(s) => `/suppliers/${s.id}`}
              empty={`Nothing matches “${query}”.`}
              phoneRow={(s) => ({
                title: s.name,
                subtitle: [formatPhone(s.phone) || s.contact, s.sells].filter(Boolean).join(" · ") || undefined,
                trailing: <Money amount={s.totalUsd} />,
              })}
            />
          </Panel>
        </>
      )}
    </div>
  );
}
