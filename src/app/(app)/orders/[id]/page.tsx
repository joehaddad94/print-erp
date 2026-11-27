import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/form/action-form";
import { AddItem } from "@/components/orders/add-item";
import { AddLineFields } from "@/components/orders/add-line-fields";
import { CopyForDriver } from "@/components/orders/copy-for-driver";
import { LineEdit } from "@/components/orders/line-edit";
import { CHANNELS, channelLabel, methodLabel } from "@/components/orders/labels";
import { Icon } from "@/components/shell/icons";
import {
  Badge,
  Button,
  Callout,
  ConfirmButton,
  Timeline,
  InlineDetails,
  Money,
  PageHeader,
  Panel,
  buttonClass,
  formatWhen,
} from "@/components/ui";
import { Link } from "@/components/ui/link";
import { MapPinLink } from "@/components/ui/map-pin-link";
import { cn } from "@/lib/cn";
import { db } from "@/db";
import { formatMoney, type Currency } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { requireUser } from "@/server/auth/session";
import { historyFor } from "@/server/edits/engine";
import {
  addLineAction,
  deleteLineAction,
  deleteOrderAction,
  deletePaymentAction,
  deliverNowAction,
  markReceivedAction,
  setStatusAction,
  takeFromAction,
  updateLineFieldAction,
  updateOrderFieldAction,
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

const payTone = { unpaid: "warning", partly_paid: "info", paid: "success" } as const;
const TZ = "Asia/Beirut";
const isoDay = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: TZ });
const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
/** "due tomorrow (27 Nov)", "due today", "due 3 Dec", "was due 20 Nov". */
function dueText(iso: string, open: boolean) {
  if (iso === isoDay(0)) return `due today (${shortDay(iso)})`;
  if (iso === isoDay(1)) return `due tomorrow (${shortDay(iso)})`;
  if (open && iso < isoDay(0)) return `was due ${shortDay(iso)}`;
  return `due ${shortDay(iso)}`;
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Order (prototype /orders/1042): header actions, items, payments, history; money, click-to-edit details, status. */
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
  const cancelled = o.status === "cancelled";
  const delivered = o.status === "delivered";
  const quoted = o.status === "quoted";
  const cur = o.currency as Currency;
  const needToPrint = o.lines.reduce((n, l) => n + Math.max(0, l.needToPrint), 0);
  const status = shownStatus({ status: o.status, needToPrint, lineCount: o.lines.length });
  const ready = open && !quoted && o.fullyReserved;
  const c = o.customer;
  const address = o.deliveryAddress ?? c?.address ?? "";
  const fromCustomer = o.deliveryAddress == null && !!c?.address;
  const money = (n: number) => formatMoney(n, cur);
  // History (prototype `hist`): created, every payment, every logged change and the delivery, oldest first.
  const FIELD: Record<string, string> = {
    status: "Status",
    channel: "Channel",
    due_on: "Due",
    customer_id: "Customer",
    delivery_charge: "Delivery charge",
    delivered_by: "Driver",
    delivery_address: "Deliver to",
    notes: "Notes",
    currency: "Currency",
  };
  const val = (field: string, v: unknown) =>
    v == null || v === ""
      ? "—"
      : field === "status"
        ? (STATUS_LABELS[v as keyof typeof STATUS_LABELS] ?? String(v))
        : field === "channel"
          ? channelLabel(String(v))
          : field === "due_on"
            ? shortDay(String(v))
            : String(v);
  const timeline = [
    { id: "created", at: o.createdAt, text: "Created" },
    ...o.payments.map((p) => ({
      id: `pay-${p.id}`,
      at: p.createdAt,
      text: `${p.amount < 0 ? "Refund" : "Payment"} ${formatMoney(Math.abs(p.amount), p.currency as Currency)} ${methodLabel(p.method).toLowerCase()}`,
    })),
    ...history
      .filter((e) => e.action === "edit" && e.field in FIELD)
      .map((e) => ({
        id: `edit-${e.id}`,
        at: e.editedAt,
        text:
          e.field === "customer_id"
            ? "Customer changed"
            : `${FIELD[e.field]} ${val(e.field, e.oldValue)} → ${val(e.field, e.newValue)}`,
      })),
    ...(o.deliveredAt ? [{ id: "delivered", at: o.deliveredAt, text: "Delivered" }] : []),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const driverText = [
    c?.name ?? `Order #${o.id}`,
    c?.phone ? formatPhone(c.phone) : null,
    address || null,
    c?.mapUrl ?? null,
    o.balance.balanceDueUsd > 0.005
      ? `${formatMoney(o.balance.balanceDueUsd, "USD")} to collect`
      : "Paid, nothing to collect",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/orders", label: "Orders" }}
        title={`Order #${o.id}`}
        badges={
          <>
            <Badge tone={cancelled ? "neutral" : delivered || status === "Ready" ? "success" : "info"}>{status}</Badge>
            {open && !quoted && needToPrint > 0 ? <Badge tone="danger">Need to print {needToPrint}</Badge> : null}
            {cancelled || (o.balance.totalUsd <= 0 && o.balance.receivedUsd === 0) ? null : (
              <Badge tone={payTone[o.balance.paymentState]}>{PAYMENT_STATE_LABELS[o.balance.paymentState]}</Badge>
            )}
          </>
        }
        description={
          <>
            {c ? (
              <Link
                className="inline-flex min-h-tap items-center text-action hover:underline lg:min-h-6"
                href={`/customers/${c.id}`}
              >
                {c.name}
              </Link>
            ) : (
              "No customer"
            )}{" "}
            · {channelLabel(o.channel)}
            {o.dueOn ? ` · ${dueText(o.dueOn, open)}` : ""}
          </>
        }
        action={
          cancelled ? undefined : (
            <div className="flex w-full gap-2 *:flex-1 sm:w-auto sm:*:flex-none">
              <Link href={`/orders/${o.id}/pay`} className={buttonClass("secondary")}>
                Record payment
              </Link>
              {open ? (
                ready ? (
                  <ConfirmButton
                    variant="primary"
                    title={`Deliver order #${o.id}?`}
                    body={
                      <>
                        {plural(
                          o.lines.reduce((n, l) => n + l.quantity, 0),
                          "piece",
                        )}{" "}
                        leave stock, with their packaging. This can&apos;t be undone.
                        {o.balance.balanceDueUsd > 0.005
                          ? ` ${formatMoney(o.balance.balanceDueUsd, "USD")} is still due; you can record it after.`
                          : ""}
                      </>
                    }
                    confirmLabel="Deliver"
                    action={deliverNowAction.bind(null, o.id)}
                  >
                    Deliver
                  </ConfirmButton>
                ) : (
                  <Button disabled>Deliver</Button>
                )
              ) : null}
            </div>
          )
        }
      />

      <div className="grid items-start gap-5 lg:grid-detail">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Items" titleId="lines" count={o.lines.length} flush>
            {o.lines.length === 0 ? <p className="px-4 py-4 text-sm text-ink-muted">No items yet.</p> : null}
            <ul className="divide-y divide-border">
              {o.lines.map((l) => {
                const donor = donors.get(l.id);
                const take = donor ? Math.min(l.needToPrint, donor.reserved) : 0;
                const name = productLabel({ name: l.productName, variant: l.productVariant });
                const parts = partsNeeded.filter((x) => x.productId === l.productId);
                return (
                  <li key={l.id} className="flex items-start gap-3 px-4 py-3">
                    <span
                      aria-hidden="true"
                      className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-muted text-ink-muted"
                    >
                      <Icon name="products" size={16} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      {open ? (
                        <LineEdit
                          save={updateLineFieldAction.bind(null, o.id, l.id)}
                          name={name}
                          quantity={String(l.quantity)}
                          price={String(l.unitPrice)}
                          priceShown={
                            cur === "USD" ? l.unitPrice.toFixed(2) : Math.round(l.unitPrice).toLocaleString("en-US")
                          }
                          note={l.customization ?? ""}
                          currency={cur}
                        />
                      ) : (
                        <>
                          <p className="font-medium">
                            {l.quantity} × {name}
                          </p>
                          <p className="text-xs text-ink-muted">
                            {money(l.unitPrice)} each{l.customization ? ` · ${l.customization}` : ""}
                            {l.unitCostUsd != null
                              ? ` · cost ${formatMoney(l.unitCostUsd + (l.packagingCostPerUnitUsd ?? 0), "USD")} each`
                              : ""}
                          </p>
                        </>
                      )}
                      {open && !quoted ? (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
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
                              <button
                                type="submit"
                                className="inline-flex min-h-tap cursor-pointer items-center rounded-sm px-1.5 font-medium text-action hover:bg-action-soft lg:min-h-6"
                              >
                                Take {take} from #{donor.fromOrderId}
                                {donor.dueOn ? ` (due ${shortDay(donor.dueOn)})` : ""}
                              </button>
                            </form>
                          ) : null}
                        </div>
                      ) : null}
                      {open && !quoted && l.needToPrint > 0 && parts.length ? (
                        <p className="text-xs text-ink-muted">
                          Parts to make {l.needToPrint}:{" "}
                          {parts
                            .map((x) => `${x.needed} × ${x.partName} (${Math.max(0, x.available)} available)`)
                            .join(", ")}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 font-medium tabular-nums">{money(l.unitPrice * l.quantity)}</p>
                    {open ? (
                      <ConfirmButton
                        variant="quiet"
                        className="-my-1 -mr-2 min-w-tap px-0 lg:min-w-control"
                        ariaLabel={`Remove ${name}`}
                        title={`Remove ${l.quantity} × ${name}?`}
                        body="Its reserved pieces go back to stock for the next order due."
                        confirmLabel="Remove line"
                        action={deleteLineAction.bind(null, o.id, l.id)}
                      >
                        <Icon name="close" size={15} />
                      </ConfirmButton>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {open ? (
              <AddItem hint="Stock is reserved by itself: when you confirm, and when a print finishes.">
                <ActionForm action={addLineAction.bind(null, o.id)} submitLabel="Add item" defaults={{ quantity: "1" }}>
                  <AddLineFields
                    products={products.map((p) => ({ id: p.id, label: productLabel(p), salePriceUsd: p.salePriceUsd }))}
                    currency={cur}
                    rateToUsd={o.rateToUsd}
                  />
                </ActionForm>
              </AddItem>
            ) : null}
          </Panel>

          <Panel
            title="Payments"
            titleId="payments"
            count={o.payments.length}
            flush
            action={
              cancelled ? undefined : (
                <Link
                  href={`/orders/${o.id}/pay`}
                  className="inline-flex min-h-tap items-center font-medium text-action hover:underline lg:min-h-6"
                >
                  Record payment
                </Link>
              )
            }
          >
            {o.payments.length === 0 ? <p className="px-4 py-4 text-sm text-ink-muted">No payments yet.</p> : null}
            <ul className="divide-y divide-border">
              {o.payments.map((p) => (
                <li key={p.id} className="flex flex-col gap-1.5 px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {p.amount < 0 ? "Refund · " : ""}
                        {methodLabel(p.method)}
                        {p.collectedBy ? ` · ${p.collectedBy}` : ""}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {[shortDay(p.paidOn), p.reference, p.notes].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-start gap-1">
                      <Money amount={p.amount} currency={p.currency} rateToUsd={p.rateToUsd} />
                      <ConfirmButton
                        variant="quiet"
                        className="-my-1 -mr-2 min-w-tap px-0 lg:min-w-control"
                        ariaLabel="Delete payment"
                        title="Delete this payment?"
                        body={`${methodLabel(p.method)}, ${formatMoney(p.amount, p.currency as Currency)} on ${shortDay(p.paidOn)}. The balance goes back up. It stays in Change history.`}
                        confirmLabel="Delete payment"
                        action={deletePaymentAction.bind(null, o.id, p.id)}
                      >
                        <Icon name="close" size={15} />
                      </ConfirmButton>
                    </div>
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
                    <span className="text-xs text-ink-muted">Received {formatWhen(p.receivedAt)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Panel>

          {open && quoted ? (
            <Callout tone="info">
              <b>A quote holds no stock.</b> Confirm it to reserve pieces and see what needs printing.
            </Callout>
          ) : open && !o.fullyReserved ? (
            <Callout tone="warning">
              <b>Not ready to deliver.</b>{" "}
              {o.lines.length === 0
                ? "Add an item first."
                : `${plural(needToPrint, "item")} still ${needToPrint === 1 ? "needs" : "need"} printing. Every item must be reserved first.`}
            </Callout>
          ) : null}
          {delivered && o.deliveredAt ? (
            <Callout tone="success">
              Delivered {formatWhen(o.deliveredAt)}
              {o.deliveredBy ? ` by ${o.deliveredBy}` : ""}. Stock and packaging were taken out.
            </Callout>
          ) : null}
          {cancelled ? <Callout tone="info">This order is cancelled. Its pieces went back to stock.</Callout> : null}

          <Panel title="History" titleId="order-history" flush>
            <Timeline entries={timeline} />
          </Panel>
        </div>

        <aside className="flex flex-col gap-5">
          <Panel title="Money" titleId="order-money">
            <dl className="flex flex-col divide-y divide-border text-md">
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
              <Row label="Balance due" big>
                <Money amount={o.balance.balanceDueUsd} />
              </Row>
              {o.profitUsd != null ? (
                <>
                  <Row label={o.profitEstimated ? "Profit (est.)" : "Profit"}>
                    <Money amount={o.profitUsd} />
                  </Row>
                  <Row label="Per hour of your time">
                    {o.profitPerHourUsd != null ? formatMoney(o.profitPerHourUsd, "USD") : "—"}
                  </Row>
                </>
              ) : open && o.lines.length ? (
                <Row label="Profit (est.)">
                  <span className="text-ink-muted">—</span>
                </Row>
              ) : null}
            </dl>
          </Panel>

          <Panel title="Details" titleId="order-details">
            <div className="flex flex-col gap-3">
              <InlineDetails
                save={updateOrderFieldAction.bind(null, o.id)}
                rows={[
                  {
                    field: "customerId",
                    readOnly: !open,
                    label: "Customer",
                    value: o.customerId == null ? "" : String(o.customerId),
                    options: [{ value: "", label: "No customer" }, ...opts.customers],
                    display: c ? "Change" : undefined,
                    placeholder: "Pick",
                    before: c ? (
                      <Link
                        href={`/customers/${c.id}`}
                        className="mr-1 inline-flex min-h-tap items-center text-action hover:underline lg:min-h-6"
                      >
                        {c.name}
                      </Link>
                    ) : null,
                  },
                  { field: "channel", label: "Channel", value: o.channel, options: CHANNELS, readOnly: !open },
                  {
                    field: "dueOn",
                    readOnly: !open,
                    label: "Due",
                    value: o.dueOn ?? "",
                    display: o.dueOn ? shortDay(o.dueOn) : undefined,
                    placeholder: "Add",
                  },
                  {
                    field: "deliveryAddress",
                    readOnly: !open,
                    label: "Deliver to",
                    value: address,
                    wide: true,
                    after:
                      fromCustomer || c?.mapUrl ? (
                        <>
                          {fromCustomer ? `From ${c!.name.split(" ")[0]}'s details` : null}
                          {fromCustomer && c?.mapUrl ? " · " : null}
                          {c?.mapUrl ? <MapPinLink href={c.mapUrl} label="Map pin" /> : null}
                        </>
                      ) : null,
                  },
                  {
                    field: "deliveryCharge",
                    readOnly: !open,
                    label: "Delivery charge",
                    note: "the driver's, not in the total",
                    value: o.deliveryCharge == null ? "" : String(o.deliveryCharge),
                    prefix: cur === "USD" && o.deliveryCharge != null ? "$" : undefined,
                    suffix: cur === "LBP" && o.deliveryCharge != null ? " LBP" : undefined,
                    inputMode: "decimal",
                  },
                  { field: "deliveredBy", label: "Driver", value: o.deliveredBy ?? "", readOnly: !open },
                  { field: "notes", label: "Notes", value: o.notes ?? "", wide: true },
                ]}
                footer={
                  open
                    ? "Click any value to change it. Every change is saved in History."
                    : "Only notes can change on a closed order."
                }
              />
              {cancelled ? null : <CopyForDriver text={driverText} />}
            </div>
          </Panel>

          {open ? (
            <Panel title="Status" titleId="order-status">
              <div className="flex flex-col gap-3">
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
                <p className="text-xs text-ink-muted">
                  Ready turns on by itself when every item is reserved, printed or from stock. Then you can deliver.
                </p>
                <div className="flex flex-wrap gap-2">
                  <ConfirmButton
                    variant="quiet"
                    className="text-danger hover:text-danger"
                    title={`Cancel order #${o.id}?`}
                    body="Its reserved pieces go back to stock for the next order due. Payments stay recorded; refund them if needed."
                    confirmLabel="Cancel order"
                    action={setStatusAction.bind(null, o.id, "cancelled")}
                  >
                    Cancel order
                  </ConfirmButton>
                  <ConfirmButton
                    variant="quiet"
                    className="text-danger hover:text-danger"
                    title={`Delete order #${o.id}?`}
                    body="Use this for an order entered by mistake. It disappears from lists; Change history keeps a copy."
                    confirmLabel="Delete order"
                    action={deleteOrderAction.bind(null, o.id)}
                  >
                    Delete order
                  </ConfirmButton>
                </div>
              </div>
            </Panel>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, big, children }: { label: string; big?: boolean; children: ReactNode }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-2", big && "font-semibold")}>
      <dt>{label}</dt>
      <dd className={cn("tabular-nums", big && "text-xl font-bold")}>{children}</dd>
    </div>
  );
}
