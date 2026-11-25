import { ActionForm } from "@/components/form/action-form";
import { OrderFields } from "@/components/orders/order-fields";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { saveOrderAction } from "@/server/orders/actions";
import { orderFormOptions } from "../options";

export default async function NewOrderPage() {
  await requireUser();
  const opts = await orderFormOptions();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="New order" />
      <Card>
        <ActionForm
          action={saveOrderAction.bind(null, null)}
          submitLabel="Create order"
          defaults={{ channel: "whatsapp", currency: "USD", lbpRate: opts.lbpRate ?? "" }}
        >
          <OrderFields {...opts} />
        </ActionForm>
      </Card>
    </div>
  );
}
