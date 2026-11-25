import { Badge, EditedMarker, List, ListRow, Money } from "@/components/ui";
import type { listOrders } from "@/server/orders/service";
import { PAYMENT_STATE_LABELS, STATUS_LABELS } from "@/server/orders/service";

type Row = Awaited<ReturnType<typeof listOrders>>[number];

const payTone = { unpaid: "warning", partly_paid: "info", paid: "success" } as const;

export function OrderRows({ rows }: { rows: Row[] }) {
  return (
    <List label="Orders">
      {rows.map((o) => (
        <ListRow
          key={o.id}
          href={`/orders/${o.id}`}
          title={`#${o.id} · ${o.customerName ?? "No customer"}`}
          subtitle={[STATUS_LABELS[o.status], o.dueOn ? `due ${o.dueOn}` : null].filter(Boolean).join(" · ")}
          trailing={<Money amount={o.totalUsd} />}
          badge={
            <span className="flex flex-wrap gap-1">
              {o.status === "cancelled" ? null : (
                <Badge tone={payTone[o.paymentState]}>{PAYMENT_STATE_LABELS[o.paymentState]}</Badge>
              )}
              {o.needToPrint > 0 && o.status !== "cancelled" && o.status !== "delivered" ? (
                <Badge tone="danger">Need to print {o.needToPrint}</Badge>
              ) : null}
              <EditedMarker at={o.editedAt} />
            </span>
          }
        />
      ))}
    </List>
  );
}
