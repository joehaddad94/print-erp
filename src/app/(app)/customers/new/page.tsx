import { ActionForm } from "@/components/form/action-form";
import { CustomerFields } from "@/components/customers/customer-fields";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { saveCustomerAction } from "@/server/orders/actions";

export default async function NewCustomerPage() {
  await requireUser();
  return (
    <div className="flex max-w-content flex-col gap-5">
      <PageHeader back={{ href: "/customers", label: "Customers" }} title="Add customer" />
      <ActionForm action={saveCustomerAction.bind(null, null)} submitLabel="Add customer" cancelHref="/customers">
        <Card className="flex flex-col gap-4">
          <CustomerFields create />
        </Card>
      </ActionForm>
    </div>
  );
}
