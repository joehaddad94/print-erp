import { AssembleForm, type AssembleProduct } from "@/components/assembly/assemble-form";
import { EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { partsOf } from "@/server/assembly/service";
import { requireUser } from "@/server/auth/session";
import { productTable } from "@/server/products/catalogue";
import { productLabel } from "@/server/products/service";

/** Assemble (prototype /assemble): turn printed parts into a finished product. */
export default async function AssemblePage({ searchParams }: PageProps<"/assemble">) {
  await requireUser();
  const want = (await searchParams).product;
  const all = await productTable(db());
  const products: AssembleProduct[] = (
    await Promise.all(
      all
        .filter((p) => p.type === "assembled")
        .map(async (p) => ({
          id: p.id,
          label: productLabel(p),
          onHand: p.onHand,
          parts: (await partsOf(db(), p.id)).map((x) => {
            const part = all.find((y) => y.id === x.partId);
            return {
              id: x.id,
              name: productLabel(x),
              qtyPerProduct: x.qtyPerProduct,
              onHand: part?.onHand ?? 0,
              avgCostUsd: part?.avgCostUsd ?? null,
            };
          }),
        })),
    )
  ).filter((p) => p.parts.length > 0);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
  const initialId = typeof want === "string" && products.some((p) => String(p.id) === want) ? want : undefined;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Assemble" description="Turn printed parts into a finished product." />
      {products.length === 0 ? (
        <EmptyState title="No product has a parts list yet">
          <p className="pb-3">Open a product and add the parts that go into one.</p>
          <Link href="/products" className={buttonClass("secondary")}>
            Go to Products
          </Link>
        </EmptyState>
      ) : (
        <AssembleForm products={products} today={today} initialId={initialId} />
      )}
    </div>
  );
}
