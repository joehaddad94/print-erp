import { ActionForm } from "@/components/form/action-form";
import { ProductFields } from "@/components/products/product-fields";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { saveProductAction } from "@/server/products/actions";
import { packagingOptions } from "@/server/products/service";

export default async function NewProductPage() {
  await requireUser();
  const packaging = await packagingOptions(db());
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Add product" />
      <Card>
        <ActionForm
          action={saveProductAction.bind(null, null)}
          submitLabel="Save product"
          defaults={{ kind: "product" }}
        >
          <ProductFields packaging={packaging.map((p) => ({ value: String(p.id), label: p.name }))} />
        </ActionForm>
      </Card>
    </div>
  );
}
