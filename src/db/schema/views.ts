import { sql } from "drizzle-orm";
import { integer, numeric, pgView, text } from "drizzle-orm/pg-core";

const n = (name: string) => numeric(name, { mode: "number" });

/** Sum of movements per stock item (spec: views). Deleted movements excluded. */
export const stockOnHand = pgView("stock_on_hand", {
  stockItemId: integer("stock_item_id").notNull(),
  onHand: n("on_hand").notNull(),
}).as(sql`
  select si.id as stock_item_id,
         coalesce(sum(m.amount) filter (where m.deleted_at is null), 0) as on_hand
  from stock_items si
  left join stock_movements m on m.stock_item_id = si.id
  where si.deleted_at is null
  group by si.id
`);

/** On hand minus qty reserved on open order lines (D21). */
export const stockAvailable = pgView("stock_available", {
  stockItemId: integer("stock_item_id").notNull(),
  onHand: n("on_hand").notNull(),
  reserved: n("reserved").notNull(),
  available: n("available").notNull(),
}).as(sql`
  select si.id as stock_item_id,
         coalesce(m.on_hand, 0) as on_hand,
         coalesce(r.reserved, 0) as reserved,
         coalesce(m.on_hand, 0) - coalesce(r.reserved, 0) as available
  from stock_items si
  left join (
    select stock_item_id, sum(amount) as on_hand
    from stock_movements
    where deleted_at is null
    group by stock_item_id
  ) m on m.stock_item_id = si.id
  left join (
    select oi.product_id, sum(oi.qty_reserved) as reserved
    from order_items oi
    join orders o on o.id = oi.order_id
    where oi.deleted_at is null and o.deleted_at is null
      and o.status not in ('delivered', 'cancelled')
    group by oi.product_id
  ) r on r.product_id = si.product_id
  where si.deleted_at is null
`);

/** Per open order line: "need to print N" (D21). Parts needed for assembled products come with M6. */
export const orderShortfall = pgView("order_shortfall", {
  orderItemId: integer("order_item_id").notNull(),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: integer("quantity").notNull(),
  qtyReserved: integer("qty_reserved").notNull(),
  needToPrint: integer("need_to_print").notNull(),
}).as(sql`
  select oi.id as order_item_id, oi.order_id, oi.product_id, oi.quantity, oi.qty_reserved,
         oi.quantity - oi.qty_reserved as need_to_print
  from order_items oi
  join orders o on o.id = oi.order_id
  where oi.deleted_at is null and o.deleted_at is null
    and o.status not in ('delivered', 'cancelled')
    and oi.quantity > oi.qty_reserved
`);

/**
 * Per order: items-only total (D37), money received, money a courier still holds,
 * balance due and payment state (D28). All in USD.
 */
export const orderBalance = pgView("order_balance", {
  orderId: integer("order_id").notNull(),
  totalUsd: n("total_usd").notNull(),
  receivedUsd: n("received_usd").notNull(),
  heldByCourierUsd: n("held_by_courier_usd").notNull(),
  balanceDueUsd: n("balance_due_usd").notNull(),
  paymentState: text("payment_state").$type<"unpaid" | "partly_paid" | "paid">().notNull(),
}).as(sql`
  with lines as (
    select o.id as order_id,
           coalesce(sum(oi.quantity * oi.unit_price) filter (where oi.deleted_at is null), 0) * o.rate_to_usd as total_usd
    from orders o
    left join order_items oi on oi.order_id = o.id
    where o.deleted_at is null
    group by o.id, o.rate_to_usd
  ), pays as (
    select p.order_id,
           coalesce(sum(p.amount * p.rate_to_usd) filter (where p.received_at is not null or p.method <> 'courier_cod'), 0) as received_usd,
           coalesce(sum(p.amount * p.rate_to_usd) filter (where p.received_at is null and p.method = 'courier_cod'), 0) as held_usd
    from payments p
    where p.deleted_at is null
    group by p.order_id
  )
  select l.order_id,
         l.total_usd,
         coalesce(p.received_usd, 0) as received_usd,
         coalesce(p.held_usd, 0) as held_by_courier_usd,
         l.total_usd - coalesce(p.received_usd, 0) - coalesce(p.held_usd, 0) as balance_due_usd,
         case
           when coalesce(p.received_usd, 0) + coalesce(p.held_usd, 0) <= 0 and l.total_usd > 0 then 'unpaid'
           when l.total_usd - coalesce(p.received_usd, 0) - coalesce(p.held_usd, 0) > 0.005 then 'partly_paid'
           else 'paid'
         end as payment_state
  from lines l
  left join pays p on p.order_id = l.order_id
`);

/**
 * Weighted average unit cost per item (D23, D38): the average recorded on the item's
 * latest non-deleted movement that carries one (maintained by src/server/stock/ledger.ts).
 */
export const stockAverageCost = pgView("stock_average_cost", {
  stockItemId: integer("stock_item_id").notNull(),
  avgUnitCostUsd: n("avg_unit_cost_usd"),
}).as(sql`
  select si.id as stock_item_id,
         (select m.avg_unit_cost_after_usd
            from stock_movements m
           where m.stock_item_id = si.id and m.deleted_at is null and m.avg_unit_cost_after_usd is not null
           order by m.moved_at desc, m.id desc
           limit 1) as avg_unit_cost_usd
  from stock_items si
  where si.deleted_at is null
`);
