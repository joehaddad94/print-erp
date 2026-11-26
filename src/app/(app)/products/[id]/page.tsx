import { notFound } from "next/navigation";
import { ActionForm } from "@/components/form/action-form";
import { ProductFields } from "@/components/products/product-fields";
import { and, asc, eq, isNull } from "drizzle-orm";
import { NumberField, SelectField } from "@/components/form/fields";
import { Button, Card, HistoryList, List, ListRow, PageHeader } from "@/components/ui";
import { products } from "@/db/schema";
import { addPartAction, removePartAction } from "@/server/assembly/actions";
import { partsOf } from "@/server/assembly/service";
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
  const [packaging, history, parts, partOptions] = await Promise.all([
    packagingOptions(db()),
    historyFor(db(), "products", id),
    partsOf(db(), id),
    db()
      .select()
      .from(products)
      .where(and(eq(products.kind, "part"), isNull(products.deletedAt)))
      .orderBy(asc(products.name)),
  ]);
  return (
    <div className="flex max-w-content flex-col gap-6">
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
      {p.kind === "product" ? (
        <section aria-labelledby="parts-list" className="flex flex-col gap-2">
          <h2 id="parts-list" className="text-lg font-semibold">
            Parts list
          </h2>
          {parts.length ? (
            <List label="Parts list">
              {parts.map((x) => (
                <ListRow
                  key={x.id}
                  title={`${x.qtyPerProduct} × ${productLabel(x)}`}
                  trailing={
                    <form action={removePartAction.bind(null, id, x.id)}>
                      <Button type="submit" variant="ghost">
                        Remove
                      </Button>
                    </form>
                  }
                />
              ))}
            </List>
          ) : (
            <p className="text-sm text-ink-muted">Printed in one piece. Add parts if you assemble it.</p>
          )}
          {partOptions.length ? (
            <Card>
              <ActionForm
                action={addPartAction.bind(null, id)}
                submitLabel="Add part"
                defaults={{ qtyPerProduct: "1" }}
              >
                <div className="grid grid-cols-2 gap-3">
                  <SelectField
                    name="partId"
                    label="Part"
                    placeholder="Choose…"
                    options={partOptions.map((o) => ({ value: String(o.id), label: productLabel(o) }))}
                  />
                  <NumberField name="qtyPerProduct" label="Per product" />
                </div>
              </ActionForm>
            </Card>
          ) : null}
        </section>
      ) : null}
      <section aria-labelledby="product-history" className="flex flex-col gap-2">
        <h2 id="product-history" className="text-lg font-semibold">
          History
        </h2>
        <HistoryList entries={history} />
      </section>
    </div>
  );
}
