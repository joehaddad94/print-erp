import { Link } from "@/components/ui/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/form/action-form";
import { CurrencyFields, DateField, NumberField, SelectField, TextField } from "@/components/form/fields";
import { AddLineFields } from "@/components/orders/add-line-fields";
import { channelLabel, METHODS, methodLabel } from "@/components/orders/labels";
import { OrderFields } from "@/components/orders/order-fields";
import { Badge, Button, Callout, HistoryList, Money, PageHeader, Panel, formatWhen } from "@/components/ui";
import { cn } from "@/lib/cn";
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
  saveOrderAction,
  setStatusAction,
  takeFromAction,
  updateLineAction,
} from "@/server/orders/actions";
import {
  donorsFor,
  getOrder,
  OPEN_STATUSES,
  PAYMENT_STATE_LABELS,
  SETTABLE_STATUSES,
  sellableProducts,
  shownStatus,
  STATUS_LABELS,
} from "@/server/orders/service";
import { productLabel } from "@/server/products/service";
import { partsShortfall } from "@/server/assembly/service";
import { orderFormOptions } from "../options";

const s = (v: unknown) => (v == null ? "" : String(v));
const payTone = { unpaid: "warning", partly_paid: "info", paid: "success" } as const;

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const o = Number.isInteger(id) ? await getOrder(db(), id) : null;
  if (!o) notFound();
  const [products, opts, history, partsNeeded, donors] = await Promise.all([
    sellableProducts(db()),
    orderFormOptions(),
    historyFor(db(), "orders", id),
    partsShortfall(db(), id),
    donorsFor(db(), id),
  ]);
  const open = (OPEN_STATUSES as readonly string[]).includes(o.status);
  const cur = o.currency as Currency;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
  const needToPrint = o.lines.reduce((n, l) => n + Math.max(0, l.needToPrint), 0);
  const status = shownStatus({ status: o.status, needToPrint, lineCount: o.lines.length });
  const quoted = o.status === "quoted";
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/orders", label: "Orders" }}
        title={`Order #${o.id}`}
        badges={
          <>
            <Badge
              tone={
                o.status === "cancelled"
                  ? "neutral"
                  : o.status === "delivered" || status === "Ready"
                    ? "success"
                    : "info"
              }
            >
              {status}
            </Badge>
            {open && !quoted && needToPrint > 0 ? <Badge tone="danger">Need to print {needToPrint}</Badge> : null}
            {o.status === "cancelled" ? null : (
              <Badge tone={payTone[o.balance.paymentState]}>{PAYMENT_STATE_LABELS[o.balance.paymentState]}</Badge>
            )}
          </>
        }
        description={
          <>
            {o.customer ? (
              <Link
                className="inline-flex min-h-tap items-center text-action hover:underline lg:min-h-6"
                href={`/customers/${o.customer.id}`}
              >
                {o.customer.name}
              </Link>
            ) : (
              "No customer"
            )}{" "}
            · {channelLabel(o.channel)}
            {o.dueOn ? ` · due ${o.dueOn}` : ""}
          </>
        }
      />

      <div className="grid items-start gap-5 lg:grid-aside">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Items" titleId="lines" count={o.lines.length} flush>
            {o.lines.length === 0 ? <p className="px-4 py-4 text-sm text-ink-muted">No items yet.</p> : null}
            <ul className="divide-y divide-border">
              {o.lines.map((l) => {
                const donor = donors.get(l.id);
                const take = donor ? Math.min(l.needToPrint, donor.reserved) : 0;
                return (
                  <li key={l.id} className="flex flex-col gap-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {l.quantity} × {productLabel({ name: l.productName, variant: l.productVariant })}
                        </p>
                        <p className="text-sm text-ink-muted">
                          {formatMoney(l.unitPrice, cur)} each{l.customization ? ` · ${l.customization}` : ""}
                        </p>
                      </div>
                      <p className="shrink-0 font-medium tabular-nums">{formatMoney(l.unitPrice * l.quantity, cur)}</p>
                    </div>
                    {open && !quoted ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {l.needToPrint > 0 ? (
                          <Badge tone="danger">Need to print {l.needToPrint}</Badge>
                        ) : (
                          <Badge tone="success">Reserved</Badge>
                        )}
                        {l.needToPrint > 0 ? (
                          <span className="text-ink-muted">
                            Reserved {l.qtyReserved} of {l.quantity}
                          </span>
                        ) : null}
                        {donor && take > 0 ? (
                          <form action={takeFromAction.bind(null, o.id, l.id, donor.fromLineId)}>
                            <Button type="submit" variant="quiet">
                              Take {take} from #{donor.fromOrderId}
                              {donor.dueOn ? ` (due ${donor.dueOn})` : ""}
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                    {open && !quoted && l.needToPrint > 0 && partsNeeded.some((x) => x.productId === l.productId) ? (
                      <p className="text-sm">
                        Parts to make {l.needToPrint}:{" "}
                        {partsNeeded
                          .filter((x) => x.productId === l.productId)
                          .map((x) => `${x.needed} × ${x.partName} (${Math.max(0, x.available)} available)`)
                          .join(", ")}
                      </p>
                    ) : null}
                    {open ? (
                      <details>
                        <summary className="flex min-h-control cursor-pointer items-center text-sm font-semibold text-action">
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
                    ) : l.unitCostUsd != null ? (
                      <p className="text-sm text-ink-muted">
                        Cost {formatMoney(l.unitCostUsd, "USD")} + packaging{" "}
                        {formatMoney(l.packagingCostPerUnitUsd ?? 0, "USD")} each
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {open ? (
              <div className="flex flex-col gap-3 border-t border-border px-4 py-4">
                <h3 className="font-semibold">Add item</h3>
                <ActionForm action={addLineAction.bind(null, o.id)} submitLabel="Add item" defaults={{ quantity: "1" }}>
                  <AddLineFields
                    products={products.map((p) => ({ id: p.id, label: productLabel(p), salePriceUsd: p.salePriceUsd }))}
                    currency={cur}
                    rateToUsd={o.rateToUsd}
                  />
                </ActionForm>
                <p className="text-sm text-ink-muted">
                  Stock is reserved by itself: when you confirm, and when a print finishes.
                </p>
              </div>
            ) : null}
          </Panel>

          <Panel title="Payments" titleId="payments" count={o.payments.length} flush>
            <ul className="divide-y divide-border">
              {o.payments.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {p.amount < 0 ? "Refund " : ""}
                        {methodLabel(p.method)}
                        {p.collectedBy ? ` · ${p.collectedBy}` : ""}
                      </p>
                      <p className="text-ink-muted">{[p.paidOn, p.reference, p.notes].filter(Boolean).join(" · ")}</p>
                    </div>
                    <Money amount={p.amount} currency={p.currency} rateToUsd={p.rateToUsd} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {p.method === "courier_cod" && !p.receivedAt ? (
                      <>
                        <Badge tone="warning">Courier has cash</Badge>
                        <form action={markReceivedAction.bind(null, o.id, p.id)}>
                          <Button type="submit" variant="secondary">
                            Mark received
                          </Button>
                        </form>
                      </>
                    ) : p.method === "courier_cod" && p.receivedAt ? (
                      <span className="text-ink-muted">Received {formatWhen(p.receivedAt)}</span>
                    ) : null}
                    <form action={deletePaymentAction.bind(null, o.id, p.id)} className="ml-auto">
                      <Button type="submit" variant="ghost">
                        Delete payment
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
            {o.status === "cancelled" ? null : (
              <div className="flex flex-col gap-3 border-t border-border px-4 py-4">
                <h3 className="font-semibold">Record payment</h3>
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
              </div>
            )}
          </Panel>

          <Panel title="History" titleId="order-history">
            <HistoryList entries={history} />
          </Panel>
        </div>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-4">
          <Panel title="Money" titleId="order-money">
            <dl className="flex flex-col divide-y divide-border text-sm">
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
          </Panel>

          {open ? (
            <Panel title="Deliver" titleId="order-deliver">
              {o.fullyReserved && !quoted ? (
                <ActionForm
                  action={deliverAction.bind(null, o.id)}
                  submitLabel="Deliver whole order"
                  defaults={{ deliveredBy: s(o.deliveredBy), deliveryCharge: s(o.deliveryCharge) }}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <TextField name="deliveredBy" label="Driver" />
                    <NumberField
                      name="deliveryCharge"
                      label="Delivery charge"
                      hint="For the driver. Not in the total."
                    />
                  </div>
                </ActionForm>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button block disabled>
                    Deliver whole order
                  </Button>
                  <p className="text-sm text-ink-muted">
                    {quoted
                      ? "Confirm the order first. A quote holds no stock."
                      : "Every item must be reserved before delivery. Print the rest; it is reserved when the print finishes."}
                  </p>
                </div>
              )}
            </Panel>
          ) : null}

          {open ? (
            <section className="rounded-lg border border-border bg-surface">
              <div className="flex flex-col gap-3 p-4">
                <h2 className="text-lg font-semibold">Status</h2>
                <div className="flex rounded-md bg-surface-muted p-0.5">
                  {SETTABLE_STATUSES.map((st) => (
                    <form key={st} action={setStatusAction.bind(null, o.id, st)} className="flex-1">
                      <button
                        type="submit"
                        disabled={st === o.status}
                        aria-pressed={st === o.status}
                        className={cn(
                          "flex min-h-control w-full cursor-pointer items-center justify-center rounded-sm px-3 text-md font-medium",
                          st === o.status
                            ? "cursor-default bg-surface text-ink shadow-raised"
                            : "text-ink-muted hover:text-ink",
                        )}
                      >
                        {STATUS_LABELS[st]}
                      </button>
                    </form>
                  ))}
                </div>
                <p className="text-sm text-ink-muted">
                  Quoted holds no stock. Confirmed reserves stock right away. Ready turns on by itself when every item
                  is reserved.
                </p>
                <form action={setStatusAction.bind(null, o.id, "cancelled")}>
                  <Button type="submit" variant="danger" block>
                    Cancel order
                  </Button>
                </form>
              </div>
            </section>
          ) : null}

          {o.status === "delivered" && o.deliveredAt ? (
            <Callout tone="success">Delivered {formatWhen(o.deliveredAt)}. Stock and packaging were taken out.</Callout>
          ) : null}

          {o.status !== "delivered" ? (
            <details className="rounded-lg border border-border bg-surface px-4">
              <summary className="flex min-h-12 cursor-pointer items-center text-sm font-semibold text-action">
                Edit order details
              </summary>
              <div className="flex flex-col gap-3 pb-4">
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
              </div>
            </details>
          ) : null}
        </aside>
      </div>
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
