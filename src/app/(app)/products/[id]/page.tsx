import { notFound } from "next/navigation";
import { PartsPanel } from "@/components/products/parts-panel";
import { Icon } from "@/components/shell/icons";
import { Badge, DataTable, InlineDetails, PageHeader, Panel, StatStrip, Timeline, buttonClass } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { formatDuration, shortDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { updateProductFieldAction } from "@/server/products/actions";
import { productActivity, productDetail, productTable } from "@/server/products/catalogue";
import { packagingOptions, productLabel } from "@/server/products/service";

const usd = (n: number) => formatMoney(n, "USD");
const TYPE = {
  product: { label: "Product", tone: "success" },
  assembled: { label: "Assembled", tone: "info" },
  part: { label: "Part", tone: "neutral" },
} as const;

/** Product (prototype /products/1): price, cost and profit, what prints it, who it is kept for, details. */
export default async function ProductPage({ params }: PageProps<"/products/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? await productDetail(db(), id) : null;
  if (!p) notFound();
  const [packaging, activity, all] = await Promise.all([
    packagingOptions(db()),
    productActivity(db(), id, p.stockItemId),
    productTable(db()),
  ]);
  const t = TYPE[p.type];
  const current = p.printedBy.find((r) => r.isCurrent);
  const printCost = p.avgCostUsd;
  const profit = p.salePriceUsd != null && p.costEachUsd != null ? p.salePriceUsd - p.costEachUsd : null;
  const sub = [
    p.type === "assembled"
      ? `Assembled from ${p.parts.length} part${p.parts.length === 1 ? "" : "s"}`
      : p.type === "part"
        ? "A part, assembled into products"
        : "Printed in one piece",
    p.packagingName,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/products", label: "Products" }}
        title={p.variant ? `${p.name} · ${p.variant}` : p.name}
        badges={<Badge tone={t.tone}>{t.label}</Badge>}
        description={sub}
        action={
          p.type === "assembled" ? (
            <Link href={`/assemble?product=${id}`} className={buttonClass("secondary")}>
              <Icon name="plus" size={15} />
              Assemble more
            </Link>
          ) : current ? (
            <Link href={`/print?recipe=${current.recipeId}`} className={buttonClass("secondary")}>
              <Icon name="plus" size={15} />
              Print more
            </Link>
          ) : undefined
        }
      />
      <StatStrip
        label="Price and cost"
        items={[
          p.type === "part"
            ? { label: "Price", value: "Not sold", note: "parts are not sold" }
            : {
                label: "Price",
                value: p.salePriceUsd != null ? usd(p.salePriceUsd) : "No price",
                note: p.salePriceUsd != null ? "you set it" : "set it in Details",
                warn: p.salePriceUsd == null,
              },
          {
            label: "Cost each",
            value: p.costEachUsd != null ? usd(p.costEachUsd) : "—",
            note:
              printCost == null
                ? "after the first print"
                : p.type !== "part" && p.packagingCostUsd
                  ? `${p.type === "assembled" ? "parts" : "print"} ${usd(printCost)} + box ${usd(p.packagingCostUsd)}`
                  : "average in stock",
          },
          {
            label: "Profit each",
            value: profit != null ? usd(profit) : "—",
            note:
              profit != null && p.salePriceUsd ? `${Math.round((profit / p.salePriceUsd) * 100)}% margin` : undefined,
            accent: profit != null && profit > 0,
          },
          {
            label: "In stock",
            value: String(p.onHand),
            note:
              p.reserved > 0
                ? `${p.reserved >= p.onHand ? `all ${p.onHand}` : p.reserved} reserved · ${p.free} free`
                : `${p.free} free`,
          },
        ]}
      />
      <div className="grid items-start gap-5 lg:grid-detail">
        <div className="flex min-w-0 flex-col gap-5">
          {p.type !== "assembled" ? (
            <Panel title="Printed by" titleId="printed-by" count={p.printedBy.length} flush>
              {p.printedBy.length ? (
                <ul className="divide-y divide-border">
                  {p.printedBy.map((r) => (
                    <li key={r.recipeId}>
                      <Link
                        href={`/recipes/${r.recipeId}`}
                        className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-surface-muted"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-muted text-ink-muted">
                          <Icon name="recipes" size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {r.name} v{r.version}
                            {r.isCurrent ? <span className="font-normal text-ink-muted"> · current</span> : null}
                          </span>
                          <span className="block truncate text-sm text-ink-muted">
                            {r.isCurrent
                              ? [
                                  `${r.qtyOnPlate} on the plate`,
                                  `${Number(r.gramsPerPiece.toFixed(1))} g each`,
                                  formatDuration(r.estimatedSeconds),
                                  r.perPieceUsd != null ? `cost ${usd(r.perPieceUsd)} each` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")
                              : `${r.qtyOnPlate} on the plate · old version`}
                          </span>
                        </span>
                        <span className="text-ink-muted">
                          <Icon name="chevron" size={16} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-4 text-sm text-ink-muted">
                  No recipe prints this yet.{" "}
                  <Link href="/recipes/import" className="font-medium text-action hover:underline">
                    Import G-code
                  </Link>
                </p>
              )}
            </Panel>
          ) : null}
          {p.type !== "part" ? (
            <Panel title="Reserved for" titleId="reserved-for" count={p.reservedFor.length} flush>
              <DataTable
                id="reserved-for-table"
                label="Reserved for"
                rows={p.reservedFor}
                rowKey={(o) => o.orderId}
                rowHref={(o) => `/orders/${o.orderId}`}
                empty="Not on any open order."
                columns={[
                  { key: "order", header: "Order", cell: (o) => `#${o.orderId}` },
                  { key: "customer", header: "Customer", cell: (o) => o.customer ?? "—" },
                  { key: "due", header: "Due", cell: (o) => shortDate(o.dueOn) },
                  { key: "reserved", header: "Reserved", numeric: true, cell: (o) => `${o.reserved} of ${o.quantity}` },
                ]}
                phoneRow={(o) => ({
                  title: `#${o.orderId}${o.customer ? ` · ${o.customer}` : ""}`,
                  subtitle: o.dueOn ? `due ${shortDate(o.dueOn)}` : undefined,
                  trailing: `${o.reserved} of ${o.quantity}`,
                })}
              />
            </Panel>
          ) : null}
          <Panel title="History" titleId="product-history" flush>
            <Timeline entries={activity} empty="Nothing printed, sold or changed yet." />
          </Panel>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Details" titleId="product-details">
            <InlineDetails
              save={updateProductFieldAction.bind(null, id)}
              footer="Click any value to change it. A new price applies to new orders only."
              rows={[
                { field: "name", label: "Name", value: p.name, wide: true },
                { field: "variant", label: "Variant", value: p.variant ?? "" },
                {
                  field: "kind",
                  label: "Type",
                  value: p.kind,
                  options: [
                    { value: "product", label: "Product" },
                    { value: "part", label: "Part" },
                  ],
                },
                ...(p.kind === "product"
                  ? [
                      {
                        field: "salePriceUsd",
                        label: "Sale price",
                        value: p.salePriceUsd != null ? p.salePriceUsd.toFixed(2) : "",
                        prefix: "$",
                        inputMode: "decimal" as const,
                      },
                      {
                        field: "packagingItemId",
                        label: "Packaging",
                        value: p.packagingItemId != null ? String(p.packagingItemId) : "",
                        options: [
                          { value: "", label: "None" },
                          ...packaging.map((o) => ({ value: String(o.id), label: o.name })),
                        ],
                      },
                    ]
                  : []),
              ]}
            />
          </Panel>
          {p.kind === "product" ? (
            <Panel title="Parts list" titleId="parts-list">
              <PartsPanel
                productId={id}
                parts={p.parts.map((x) => ({
                  id: x.id,
                  label: x.part ? productLabel(x.part) : "Deleted part",
                  qtyPerProduct: x.qtyPerProduct,
                  onHand: x.part?.onHand ?? null,
                }))}
                partOptions={all
                  .filter((x) => x.kind === "part" && !p.parts.some((y) => y.partId === x.id))
                  .map((x) => ({ value: String(x.id), label: productLabel(x) }))}
              />
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
