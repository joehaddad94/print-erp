import { notFound } from "next/navigation";
import { ActionForm } from "@/components/form/action-form";
import { ProductFields } from "@/components/products/product-fields";
import { Card, HistoryList, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { historyFor } from "@/server/edits/engine";
import { saveProductAction } from "@/server/products/actions";
import { getProduct, packagingOptions, productLabel } from "@/server/products/service";

const s = (v: unknown) => (v == null ? "" : String(v));

export default async function ProductPage({ params }: PageProps<"/products/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? await getProduct(db(), id) : null;
  if (!p) notFound();
  const [packaging, history] = await Promise.all([packagingOptions(db()), historyFor(db(), "products", id)]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={productLabel(p)} />
      <Card>
        <ActionForm
          action={saveProductAction.bind(null, id)}
          submitLabel="Save product"
          defaults={{
            name: p.name,
            variant: s(p.variant),
            kind: p.kind,
            salePriceUsd: s(p.salePriceUsd),
            packagingItemId: s(p.packagingItemId),
          }}
        >
          <ProductFields packaging={packaging.map((o) => ({ value: String(o.id), label: o.name }))} />
        </ActionForm>
      </Card>
      <section aria-labelledby="product-history" className="flex flex-col gap-2">
        <h2 id="product-history" className="text-lg font-bold">
          History
        </h2>
        <HistoryList entries={history} />
      </section>
    </div>
  );
}
