import { and, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import { stockItems } from "@/db/schema";
import { LOW_FILAMENT_G } from "@/lib/filament";
import { listOrders } from "@/server/orders/service";
import { runningJobs } from "@/server/printing/service";
import { onHand } from "@/server/stock/ledger";

type Db = PostgresJsDatabase<typeof schema>;

export { LOW_FILAMENT_G };

const TZ = "Asia/Beirut";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

/** Beirut calendar date `days` from `now` as YYYY-MM-DD. */
export function beirutDate(now: Date, days = 0) {
  return dayKey(new Date(now.getTime() + days * 86_400_000));
}

/**
 * R3 Today strip: sales and profit this month (delivered orders, items only per D37),
 * profit per hour of your time (D24), and what customers still owe.
 */
export async function monthSummary(db: Db, now = new Date()) {
  const month = beirutDate(now).slice(0, 7);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const prev = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const rows = await db.execute<{
    month: string;
    sales: string | null;
    profit: string | null;
    minutes: string | null;
    costed: string;
    lines: string;
  }>(sql`
    select to_char(o.delivered_at at time zone ${TZ}, 'YYYY-MM') as month,
           sum(oi.quantity * oi.unit_price * o.rate_to_usd) as sales,
           sum(oi.quantity * (oi.unit_price * o.rate_to_usd - coalesce(oi.unit_cost_usd, 0) - coalesce(oi.packaging_cost_per_unit_usd, 0))) as profit,
           sum(oi.quantity * oi.labour_minutes_per_unit) as minutes,
           count(*) filter (where oi.labour_minutes_per_unit is not null) as costed,
           count(*) as lines
    from orders o
    join order_items oi on oi.order_id = o.id and oi.deleted_at is null
    where o.deleted_at is null and o.status = 'delivered'
      and to_char(o.delivered_at at time zone ${TZ}, 'YYYY-MM') in (${month}, ${prev})
    group by 1`);
  const list = [...rows] as {
    month: string;
    sales: string | null;
    profit: string | null;
    minutes: string | null;
    costed: string;
    lines: string;
  }[];
  const cur = list.find((r) => r.month === month);
  const last = list.find((r) => r.month === prev);
  const sales = Number(cur?.sales ?? 0);
  const lastSales = Number(last?.sales ?? 0);
  const profit = Number(cur?.profit ?? 0);
  const minutes = Number(cur?.minutes ?? 0);
  const allTimed = cur != null && Number(cur.costed) === Number(cur.lines);

  const open = await listOrders(db);
  const owing = open.filter((o) => o.status !== "cancelled" && o.status !== "quoted" && o.balanceDueUsd > 0.005);
  return {
    sales,
    salesChangePct: lastSales > 0 ? ((sales - lastSales) / lastSales) * 100 : null,
    profit,
    marginPct: sales > 0 ? (profit / sales) * 100 : null,
    profitPerHour: allTimed && minutes > 0 ? profit / (minutes / 60) : null,
    unpaid: owing.reduce((s, o) => s + o.balanceDueUsd, 0),
    unpaidOrders: owing.length,
  };
}

export type NeedsYou = {
  key: string;
  tone: "danger" | "warning" | "success" | "info";
  title: string;
  reason: string;
  /** The one action that clears it. */
  action: { label: string; href: string };
  /** Where the row itself opens. */
  href: string;
};

/**
 * R3 "Needs you": each row is the item, why, and the one button that clears it.
 * Order: overdue or due soon with pieces to print, finished prints to log, ready to deliver,
 * money owed, quotes, low filament.
 */
export async function needsYou(db: Db, now = new Date()): Promise<NeedsYou[]> {
  const today = beirutDate(now);
  const week = beirutDate(now, 7);
  const [orders, running, filaments] = await Promise.all([
    listOrders(db),
    runningJobs(db),
    db
      .select({ id: stockItems.id, name: stockItems.name })
      .from(stockItems)
      .where(and(eq(stockItems.type, "filament"), isNull(stockItems.deletedAt))),
  ]);
  const out: (NeedsYou & { rank: number })[] = [];
  const who = (o: { id: number; customerName: string | null }) => `#${o.id} · ${o.customerName ?? "No customer"}`;
  const due = (d: string | null) =>
    d == null
      ? ""
      : d < today
        ? "Overdue"
        : d === today
          ? "Due today"
          : d === beirutDate(now, 1)
            ? "Due tomorrow"
            : `Due ${d}`;

  for (const j of running) {
    const left =
      j.estimatedSeconds == null ? null : j.estimatedSeconds - (now.getTime() - j.startedAt.getTime()) / 1000;
    const done = left != null && left <= 0;
    out.push({
      key: `print-${j.id}`,
      rank: done ? 1 : 6,
      tone: done ? "success" : "info",
      title: `${j.recipeName} on ${j.machineName}`,
      reason: done
        ? "Should be done: log the result"
        : left != null
          ? `Printing · about ${Math.ceil(left / 60)} min left`
          : "Printing",
      action: { label: "Finish", href: `/print/${j.id}` },
      href: `/print/${j.id}`,
    });
  }
  for (const o of orders) {
    if (o.status === "delivered" || o.status === "cancelled") continue;
    if (o.status === "quoted") {
      out.push({
        key: `quote-${o.id}`,
        rank: 5,
        tone: "info",
        title: who(o),
        reason: `Quote · ${o.dueOn ? due(o.dueOn).toLowerCase() : "no due date"}`,
        action: { label: "Confirm", href: `/orders/${o.id}` },
        href: `/orders/${o.id}`,
      });
      continue;
    }
    if (o.needToPrint > 0 && o.dueOn && o.dueOn <= week) {
      out.push({
        key: `print-order-${o.id}`,
        rank: o.dueOn <= beirutDate(now, 1) ? 0 : 2,
        tone: "danger",
        title: who(o),
        reason: `${due(o.dueOn)} · need to print ${o.needToPrint}`,
        action: { label: "Start print", href: "/print" },
        href: `/orders/${o.id}`,
      });
      continue; // one row per order: printing comes first
    } else if (o.needToPrint === 0 && o.dueOn && o.dueOn <= week) {
      out.push({
        key: `deliver-${o.id}`,
        rank: 3,
        tone: "success",
        title: who(o),
        reason: `Ready${o.balanceDueUsd > 0.005 ? "" : " and paid"} · ${due(o.dueOn).toLowerCase()}`,
        action: { label: "Deliver", href: `/orders/${o.id}` },
        href: `/orders/${o.id}`,
      });
      continue;
    }
    if (o.balanceDueUsd > 0.005 && o.dueOn && o.dueOn <= week) {
      out.push({
        key: `pay-${o.id}`,
        rank: 4,
        tone: "warning",
        title: who(o),
        reason: `Unpaid $${o.balanceDueUsd.toFixed(2)} · ${due(o.dueOn).toLowerCase()}`,
        action: { label: "Record payment", href: `/orders/${o.id}` },
        href: `/orders/${o.id}`,
      });
    }
  }
  for (const f of filaments) {
    const g = await onHand(db, f.id);
    if (g < LOW_FILAMENT_G)
      out.push({
        key: `low-${f.id}`,
        rank: 7,
        tone: "warning",
        title: `${f.name} is low`,
        reason: `${Math.max(0, Math.round(g))} g left`,
        action: { label: "Buy", href: "/purchases/new" },
        href: "/stock",
      });
  }
  return out.sort((a, b) => a.rank - b.rank).map(({ rank: _rank, ...r }) => r);
}

/** "Due this week": open orders by due date. */
export async function dueThisWeek(db: Db, now = new Date()) {
  const week = beirutDate(now, 7);
  return (await listOrders(db))
    .filter((o) => !["delivered", "cancelled"].includes(o.status) && o.dueOn && o.dueOn <= week)
    .slice(0, 6);
}
