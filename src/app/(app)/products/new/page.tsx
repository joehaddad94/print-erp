import { ActionForm } from "@/components/form/action-form";
import { ProductFields } from "@/components/products/product-fields";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { saveProductAction } from "@/server/products/actions";
import { packagingOptions } from "@/server/products/service";

/** Add product (prototype /products/new). */
export default async function NewProductPage() {
  await requireUser();
  const packaging = await packagingOptions(db());
  return (
    <div className="flex max-w-content flex-col gap-5">
      <PageHeader
        back={{ href: "/products", label: "Products" }}
        title="Add product"
        description="Importing a recipe also creates its products."
      />
      <ActionForm
        action={saveProductAction.bind(null, null)}
        submitLabel="Save product"
        cancelHref="/products"
        defaults={{ kind: "product" }}
      >
        <Card className="flex flex-col gap-4">
          <ProductFields packaging={packaging.map((p) => ({ value: String(p.id), label: p.name }))} />
        </Card>
      </ActionForm>
    </div>
  );
}
