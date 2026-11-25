import Link from "next/link";
import { EmptyState, List, ListRow, PageHeader, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { productLabel } from "@/server/products/service";
import { listRecipes, plateGrams } from "@/server/recipes/service";

export default async function RecipesPage() {
  await requireUser();
  const rows = await listRecipes(db());
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Recipes"
        action={
          <Link href="/recipes/import" className={buttonClass("primary")}>
            Import G-code
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No recipes yet">Import a .gcode file from Creality Print to make the first one.</EmptyState>
      ) : (
        <List label="Recipes">
          {rows.map((r) => (
            <ListRow
              key={r.id}
              href={`/recipes/${r.id}`}
              title={`${r.name} · v${r.version}`}
              subtitle={r.items
                .map((i) => `${i.qtyOnPlate} × ${productLabel({ name: i.productName, variant: i.productVariant })}`)
                .join(", ")}
              trailing={<span className="text-sm tabular-nums">{Number((plateGrams(r) ?? 0).toFixed(2))} g</span>}
            />
          ))}
        </List>
      )}
    </div>
  );
}
