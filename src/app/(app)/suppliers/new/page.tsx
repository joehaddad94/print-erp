import { ActionForm } from "@/components/form/action-form";
import { SupplierFields } from "@/components/suppliers/supplier-fields";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { saveSupplierAction } from "@/server/suppliers/actions";

export default async function NewSupplierPage() {
  await requireUser();
  return (
    <div className="flex max-w-content flex-col gap-5">
      <PageHeader back={{ href: "/suppliers", label: "Suppliers" }} title="Add supplier" />
      <ActionForm action={saveSupplierAction.bind(null, null)} submitLabel="Add supplier" cancelHref="/suppliers">
        <Card className="flex flex-col gap-4">
          <SupplierFields create />
        </Card>
      </ActionForm>
    </div>
  );
}
