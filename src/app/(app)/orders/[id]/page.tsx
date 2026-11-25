import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/form/action-form";
import { CurrencyFields, DateField, NumberField, SelectField, TextField } from "@/components/form/fields";
import { AddLineFields } from "@/components/orders/add-line-fields";
import { channelLabel, METHODS, methodLabel } from "@/components/orders/labels";
import { OrderFields } from "@/components/orders/order-fields";
import { Badge, Button, Callout, Card, HistoryList, Money, PageHeader, formatWhen } from "@/components/ui";
import { db } from "@/db";
import { formatMoney, type Currency } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { historyFor } from "@/server/edits/engine";
import {
  addLineAction,
  deleteLineAction,
  deleteOrderAction,
  deletePaymentAction,
  deliverAction,
  markReceivedAction,
  recordPaymentAction,
  reserveAction,
  saveOrderAction,
  setStatusAction,
  updateLineAction,
} from "@/server/orders/actions";
import {
  getOrder,
  OPEN_STATUSES,
  PAYMENT_STATE_LABELS,
  sellableProducts,
  STATUS_LABELS,
} from "@/server/orders/service";
import { productLabel } from "@/server/products/service";
import { orderFormOptions } from "../options";

const s = (v: unknown) => (v == null ? "" : String(v));
const payTone = { unpaid: "warning", partly_paid: "info", paid: "success" } as const;

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const o = Number.isInteger(id) ? await getOrder(db(), id) : null;
  if (!o) notFound();
  const [products, opts, history] = await Promise.all([
    sellableProducts(db()),
    orderFormOptions(),
    historyFor(db(), "orders", id),
  ]);
  const open = (OPEN_STATUSES as readonly string[]).includes(o.status);
  const cur = o.currency as Currency;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={`Order #${o.id}`} />
      <Card className="flex flex-col gap-2 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <Badge tone={o.status === "cancelled" ? "neutral" : o.status === "delivered" ? "success" : "info"}>
            {STATUS_LABELS[o.status]}
          </Badge>
          {o.status === "cancelled" ? null : (
            <Badge tone={payTone[o.balance.paymentState]}>{PAYMENT_STATE_LABELS[o.balance.paymentState]}</Badge>
          )}
          <span>
            {o.customer ? (
              <Link
                className="inline-flex min-h-tap items-center font-semibold underline"
                href={`/customers/${o.customer.id}`}
              >
                {o.customer.name}
              </Link>
            ) : (
              "No customer"
            )}{" "}
            · {channelLabel(o.channel)}
            {o.dueOn ? ` · due ${o.dueOn}` : ""}
          </span>
        </p>
        <dl className="flex flex-col divide-y divide-border">
          <Row label="Total (items only)">
            <Money amount={o.balance.totalUsd} />
          </Row>
          <Row label="Received">
            <Money amount={o.balance.receivedUsd} />
          </Row>
          {o.balance.heldByCourierUsd ? (
            <Row label="Courier has cash">
              <Money amount={o.balance.heldByCourierUsd} />
            </Row>
          ) : null}
          <Row label="Balance due" strong>
            <Money amount={o.balance.balanceDueUsd} />
          </Row>
          {o.deliveryCharge != null ? (
            <Row label={`Delivery charge, for the driver${o.deliveredBy ? ` (${o.deliveredBy})` : ""}`}>
              {formatMoney(o.deliveryCharge, cur)}
            </Row>
          ) : null}
          {o.profitUsd != null ? (
            <>
              <Row label="Profit" strong>
                <Money amount={o.profitUsd} />
              </Row>
              <Row label="Profit per hour of your time">
                {o.profitPerHourUsd != null ? `${formatMoney(o.profitPerHourUsd, "USD")}/h` : "—"}
              </Row>
            </>
          ) : null}
        </dl>
      </Card>

      <section aria-labelledby="lines" className="flex flex-col gap-2">
        <h2 id="lines" className="text-lg font-bold">
          Items
        </h2>
        {o.lines.length === 0 ? <p className="text-sm text-ink-muted">No items yet.</p> : null}
        {o.lines.map((l) => (
          <Card key={l.id} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {l.quantity} × {productLabel({ name: l.productName, variant: l.productVariant })}
                </p>
                <p className="text-xs text-ink-muted">
                  {formatMoney(l.unitPrice, cur)} each{l.customization ? ` · ${l.customization}` : ""}
                </p>
              </div>
              {open ? (
                l.needToPrint > 0 ? (
                  <Badge tone="danger">Need to print {l.needToPrint}</Badge>
                ) : (
                  <Badge tone="success">Reserved</Badge>
                )
              ) : null}
            </div>
            {open ? (
              <>
                <p className="text-xs text-ink-muted">
                  Reserved {l.qtyReserved} of {l.quantity} · {Math.max(0, l.available)} more available
                </p>
                <details>
                  <summary className="flex min-h-tap cursor-pointer items-center text-sm font-semibold text-action">
                    Edit line
                  </summary>
                  <div className="flex flex-col gap-3 pt-2">
                    <ActionForm
                      action={updateLineAction.bind(null, o.id, l.id)}
                      submitLabel="Save line"
                      defaults={{
                        quantity: s(l.quantity),
                        unitPrice: s(l.unitPrice),
                        customization: s(l.customization),
                      }}
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <NumberField name="quantity" label="Quantity" />
                        <NumberField name="unitPrice" label={`Price each (${cur})`} />
                      </div>
                      <TextField name="customization" label="Customization" />
                    </ActionForm>
                    <form action={deleteLineAction.bind(null, o.id, l.id)}>
                      <Button type="submit" variant="danger" block>
                        Remove line
                      </Button>
                    </form>
                  </div>
                </details>
              </>
            ) : l.unitCostUsd != null ? (
              <p className="text-xs text-ink-muted">
                Cost {formatMoney(l.unitCostUsd, "USD")} + packaging{" "}
                {formatMoney(l.packagingCostPerUnitUsd ?? 0, "USD")} each
              </p>
            ) : null}
          </Card>
        ))}
        {open ? (
          <Card>
            <h3 className="pb-3 font-bold">Add item</h3>
            <ActionForm action={addLineAction.bind(null, o.id)} submitLabel="Add item" defaults={{ quantity: "1" }}>
              <AddLineFields
                products={products.map((p) => ({ id: p.id, label: productLabel(p), salePriceUsd: p.salePriceUsd }))}
                currency={cur}
                rateToUsd={o.rateToUsd}
              />
            </ActionForm>
          </Card>
        ) : null}
      </section>

      {open ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Stock and delivery</h2>
          {!o.fullyReserved && o.lines.length ? (
            <form action={reserveAction.bind(null, o.id)}>
              <Button type="submit" variant="secondary" block>
                Reserve from stock
              </Button>
            </form>
          ) : null}
          {o.fullyReserved ? (
            <ActionForm
              action={deliverAction.bind(null, o.id)}
              submitLabel="Deliver whole order"
              defaults={{ deliveredBy: s(o.deliveredBy), deliveryCharge: s(o.deliveryCharge) }}
            >
              <div className="grid grid-cols-2 gap-3">
                <TextField name="deliveredBy" label="Driver" />
                <NumberField name="deliveryCharge" label="Delivery charge" hint="For the driver. Not in the total." />
              </div>
            </ActionForm>
          ) : (
            <>
              <Button block disabled>
                Deliver whole order
              </Button>
              <p className="text-sm text-ink-muted">
                Every item must be reserved before delivery. Print or reserve the rest.
              </p>
            </>
          )}
        </Card>
      ) : null}

      <section aria-labelledby="payments" className="flex flex-col gap-2">
        <h2 id="payments" className="text-lg font-bold">
          Payments
        </h2>
        {o.payments.map((p) => (
          <Card key={p.id} className="flex flex-col gap-2 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {p.amount < 0 ? "Refund " : ""}
                  {methodLabel(p.method)}
                  {p.collectedBy ? ` · ${p.collectedBy}` : ""}
                </p>
                <p className="text-xs text-ink-muted">{[p.paidOn, p.reference, p.notes].filter(Boolean).join(" · ")}</p>
              </div>
              <Money amount={p.amount} currency={p.currency} rateToUsd={p.rateToUsd} />
            </div>
            {p.method === "courier_cod" && !p.receivedAt ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warning">Courier has cash</Badge>
                <form action={markReceivedAction.bind(null, o.id, p.id)}>
                  <Button type="submit" variant="secondary">
                    Mark received
                  </Button>
                </form>
              </div>
            ) : p.method === "courier_cod" && p.receivedAt ? (
              <p className="text-xs text-ink-muted">Received {formatWhen(p.receivedAt)}</p>
            ) : null}
            <form action={deletePaymentAction.bind(null, o.id, p.id)}>
              <Button type="submit" variant="ghost">
                Delete payment
              </Button>
            </form>
          </Card>
        ))}
        {o.status === "cancelled" ? null : (
          <Card>
            <h3 className="pb-3 font-bold">Record payment</h3>
            <ActionForm
              action={recordPaymentAction.bind(null, o.id)}
              submitLabel="Record payment"
              defaults={{ paidOn: today, currency: o.currency, method: "cash", lbpRate: opts.lbpRate ?? "" }}
            >
              <div className="grid grid-cols-2 gap-3">
                <NumberField name="amount" label="Amount" hint="Negative for a refund." />
                <DateField name="paidOn" label="Date" />
              </div>
              <CurrencyFields lbpRateDefault={opts.lbpRate} />
              <SelectField name="method" label="Method" options={METHODS} />
              <div className="grid grid-cols-2 gap-3">
                <TextField name="collectedBy" label="Collected by" />
                <TextField name="reference" label="Reference" />
              </div>
            </ActionForm>
          </Card>
        )}
      </section>

      {open ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Status</h2>
          <div className="flex flex-wrap gap-2">
            {OPEN_STATUSES.map((st) => (
              <form key={st} action={setStatusAction.bind(null, o.id, st)}>
                <Button type="submit" variant={st === o.status ? "primary" : "secondary"} disabled={st === o.status}>
                  {STATUS_LABELS[st]}
                </Button>
              </form>
            ))}
          </div>
          <form action={setStatusAction.bind(null, o.id, "cancelled")}>
            <Button type="submit" variant="danger" block>
              Cancel order
            </Button>
          </form>
        </Card>
      ) : null}

      {o.status !== "delivered" ? (
        <details>
          <summary className="flex min-h-tap cursor-pointer items-center text-sm font-semibold text-action">
            Edit order details
          </summary>
          <Card className="mt-2 flex flex-col gap-3">
            <ActionForm
              action={saveOrderAction.bind(null, o.id)}
              submitLabel="Save order"
              defaults={{
                customerId: s(o.customerId),
                channel: o.channel,
                dueOn: s(o.dueOn),
                currency: o.currency,
                lbpRate: o.currency === "LBP" ? String(Math.round(1 / o.rateToUsd)) : "",
                deliveredBy: s(o.deliveredBy),
                deliveryCharge: s(o.deliveryCharge),
                notes: s(o.notes),
              }}
            >
              <OrderFields {...opts} />
            </ActionForm>
            <form action={deleteOrderAction.bind(null, o.id)}>
              <Button type="submit" variant="danger" block>
                Delete order
              </Button>
            </form>
          </Card>
        </details>
      ) : null}

      {o.status === "delivered" && o.deliveredAt ? (
        <Callout tone="success">Delivered {formatWhen(o.deliveredAt)}. Stock and packaging were taken out.</Callout>
      ) : null}

      <section aria-labelledby="order-history" className="flex flex-col gap-2">
        <h2 id="order-history" className="text-lg font-bold">
          History
        </h2>
        <HistoryList entries={history} />
      </section>
    </div>
  );
}

function Row({ label, strong, children }: { label: string; strong?: boolean; children: ReactNode }) {
  return (
    <div className={strong ? "flex justify-between gap-3 py-2 font-bold" : "flex justify-between gap-3 py-2"}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}
