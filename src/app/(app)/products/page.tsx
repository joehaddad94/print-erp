import { Icon } from "@/components/shell/icons";
import {
  Badge,
  DataTable,
  EditedMarker,
  EmptyState,
  FilterBar,
  PageHeader,
  Panel,
  ColumnsMenu,
  buttonClass,
  matches,
  type Column,
} from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { shortDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { productTable, type ProductRow, type ProductType } from "@/server/products/catalogue";

const usd = (n: number) => formatMoney(n, "USD");
const TYPES: { key: ProductType; label: string; pill: string; tone: "success" | "info" | "neutral" }[] = [
  { key: "product", label: "Product", pill: "Products", tone: "success" },
  { key: "assembled", label: "Assembled", pill: "Assembled", tone: "info" },
  { key: "part", label: "Part", pill: "Parts", tone: "neutral" },
];
const typeOf = (t: ProductType) => TYPES.find((x) => x.key === t)!;
const muted = (s: string) => <span className="text-ink-muted">{s}</span>;

function price(p: ProductRow) {
  if (p.salePriceUsd != null) return usd(p.salePriceUsd);
  return p.type === "part" ? muted("Not sold") : <span className="text-warning">No price</span>;
}

const columns: Column<ProductRow>[] = [
  {
    key: "product",
    header: "Product",
    cell: (p) => (
      <span className="inline-flex items-center gap-2">
        {p.name}
        <EditedMarker at={p.editedAt} compact />
      </span>
    ),
  },
  { key: "variant", header: "Variant", cell: (p) => p.variant ?? muted("—") },
  { key: "type", header: "Type", cell: (p) => <Badge tone={typeOf(p.type).tone}>{typeOf(p.type).label}</Badge> },
  { key: "price", header: "Price", numeric: true, cell: price },
  {
    key: "cost",
    header: "Cost each",
    numeric: true,
    cell: (p) => (p.costEachUsd == null ? muted("—") : usd(p.costEachUsd)),
  },
  {
    key: "margin",
    header: "Margin",
    numeric: true,
    cell: (p) =>
      p.salePriceUsd && p.costEachUsd != null
        ? `${Math.round((1 - p.costEachUsd / p.salePriceUsd) * 100)}%`
        : muted("—"),
  },
  { key: "stock", header: "In stock", numeric: true, cell: (p) => p.onHand },
  {
    key: "free",
    header: "Free",
    numeric: true,
    cell: (p) => (p.free > 0 ? p.free : <span className="text-warning">0</span>),
  },
  { key: "sold", header: "Sold", numeric: true, cell: (p) => p.sold },
  { key: "last", header: "Last printed", cell: (p) => (p.lastPrinted ? shortDate(p.lastPrinted) : muted("—")) },
  { key: "packaging", header: "Packaging", cell: (p) => p.packagingName ?? muted("—") },
  {
    key: "recipe",
    header: "Printed by",
    truncate: true,
    cell: (p) => p.recipeName ?? (p.type === "assembled" ? "— (assembled)" : "—"),
  },
];

/** Products (prototype /products): what you sell and the parts you assemble them from. */
export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const type = TYPES.some((t) => t.key === sp.type) ? (sp.type as ProductType) : undefined;
  const all = await productTable(db());
  const found = all.filter((p) => matches(q, p.name, p.variant, p.recipeName, p.packagingName));
  const rows = found.filter((p) => !type || p.type === type);
  const add = (
    <Link href="/products/new" className={buttonClass("primary")}>
      <Icon name="plus" size={16} />
      Add product
    </Link>
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Products" description="What you sell, and the parts you assemble them from." action={add} />
      {all.length === 0 ? (
        <EmptyState title="No products yet">Importing a recipe also creates its products.</EmptyState>
      ) : (
        <>
          <FilterBar
            base="/products"
            q={q}
            current={type}
            placeholder="Search products"
            right={
              <span className="hidden lg:block">
                <ColumnsMenu
                  tableId="products"
                  bordered
                  pinned={["product"]}
                  columns={columns.map(({ key, header }) => ({ key, header }))}
                />
              </span>
            }
            options={[
              { key: "", label: "All", count: found.length },
              ...TYPES.map((t) => ({ key: t.key, label: t.pill, count: found.filter((p) => p.type === t.key).length })),
            ]}
          />
          <Panel title={type ? typeOf(type).pill : "All products"} titleId="products-table" count={rows.length} flush>
            <DataTable
              id="products"
              label="Products"
              wide
              menuOutside
              columns={columns}
              rows={rows}
              rowKey={(p) => p.id}
              rowHref={(p) => `/products/${p.id}`}
              empty={q ? `Nothing matches “${q}”.` : "None of this type yet."}
              phoneRow={(p) => ({
                title: p.variant ? `${p.name} · ${p.variant}` : p.name,
                subtitle: `${typeOf(p.type).label} · ${p.onHand} in stock · ${p.free} free`,
                trailing: price(p),
                badge: p.editedAt ? <EditedMarker at={p.editedAt} compact /> : undefined,
              })}
            />
          </Panel>
        </>
      )}
    </div>
  );
}
