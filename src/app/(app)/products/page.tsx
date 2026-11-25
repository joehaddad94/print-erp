import { Link } from "@/components/ui/link";
import { Badge, EditedMarker, EmptyState, List, ListRow, Money, PageHeader, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { listProducts, productLabel } from "@/server/products/service";

export default async function ProductsPage() {
  await requireUser();
  const rows = await listProducts(db());
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Products"
        action={
          <Link href="/products/new" className={buttonClass("primary")}>
            Add product
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No products yet">Importing a recipe also creates its products.</EmptyState>
      ) : (
        <List label="Products">
          {rows.map((p) => (
            <ListRow
              key={p.id}
              href={`/products/${p.id}`}
              title={productLabel(p)}
              subtitle={[
                p.kind === "part" ? "Part" : "Product",
                p.recipeCount ? `${p.recipeCount} recipe${p.recipeCount > 1 ? "s" : ""}` : "No recipe",
                p.packagingName,
              ]
                .filter(Boolean)
                .join(" · ")}
              trailing={
                p.kind === "part" ? null : p.salePriceUsd == null ? (
                  <Badge tone="warning">No price</Badge>
                ) : (
                  <Money amount={p.salePriceUsd} />
                )
              }
              badge={<EditedMarker at={p.editedAt} />}
            />
          ))}
        </List>
      )}
    </div>
  );
}
