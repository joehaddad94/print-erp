import { Icon, type IconName } from "@/components/shell/icons";
import { EmptyState, PageHeader, Panel, buttonClass } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { dueThisWeek, monthSummary, needsYou, type NeedsYou } from "@/server/today/service";

const usd = (n: number) => formatMoney(n, "USD");

const TONE: Record<NeedsYou["tone"], string> = {
  danger: "bg-danger-bg text-danger",
  warning: "bg-warning-bg text-warning",
  success: "bg-success-bg text-success",
  info: "bg-info-bg text-info",
};
const ICON: Record<NeedsYou["tone"], IconName> = {
  danger: "machines",
  warning: "expenses",
  success: "check",
  info: "orders",
};

/**
 * R3 Today: a one-screen "what needs me" page (docs/DESIGN-SYSTEM.md §5).
 * Four numbers, then Needs you (item, reason, the one button), then Due this week.
 */
export default async function TodayPage({ searchParams }: PageProps<"/">) {
  await requireUser();
  const denied = (await searchParams).denied === "owner";
  const [sum, todo, due] = await Promise.all([monthSummary(db()), needsYou(db()), dueThisWeek(db())]);
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Beirut",
  });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Today"
        description={today}
        action={
          <Link href="/orders/new" className={buttonClass("secondary")}>
            <Icon name="plus" size={15} />
            New order
          </Link>
        }
      />
      {denied ? (
        <p role="status" className="rounded-md bg-warning-bg px-3 py-2 text-sm text-warning">
          That screen is for the owner only.
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        <Stat label="Sales this month" value={usd(sum.sales)} accent>
          {sum.salesChangePct != null ? (
            <>
              <b className="font-semibold">
                {sum.salesChangePct >= 0 ? "+" : ""}
                {Math.round(sum.salesChangePct)}%
              </b>{" "}
              vs last month
            </>
          ) : (
            "Delivered orders"
          )}
        </Stat>
        <Stat label="Profit this month" value={usd(sum.profit)}>
          {sum.marginPct != null ? `${Math.round(sum.marginPct)}% margin` : "Items only, no delivery"}
        </Stat>
        <Stat label="Profit per hour" value={sum.profitPerHour != null ? usd(sum.profitPerHour) : "—"}>
          of your time
        </Stat>
        <Stat label="Unpaid" value={usd(sum.unpaid)}>
          {sum.unpaidOrders} order{sum.unpaidOrders === 1 ? "" : "s"}
        </Stat>
      </dl>

      <div className="grid items-start gap-5 lg:grid-aside">
        <Panel title="Needs you" titleId="needs-you" count={todo.length} flush>
          {todo.length === 0 ? (
            <p className="px-4 py-5 text-sm text-ink-muted">Nothing needs you right now.</p>
          ) : (
            <ul aria-label="Needs you" className="divide-y divide-border">
              {todo.map((t) => (
                <li key={t.key} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", TONE[t.tone])}>
                    <Icon name={ICON[t.tone]} size={16} />
                  </span>
                  <Link href={t.href} className="flex min-h-tap min-w-0 flex-1 flex-col justify-center hover:underline">
                    <span className="block truncate font-medium">{t.title}</span>
                    <span className="block truncate text-sm text-ink-muted">{t.reason}</span>
                  </Link>
                  <Link href={t.action.href} className={cn(buttonClass("secondary"), "shrink-0")}>
                    {t.action.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Due this week" titleId="due-week" flush>
          {due.length === 0 ? (
            <EmptyState title="Nothing due this week" />
          ) : (
            <ul aria-label="Due this week" className="divide-y divide-border">
              {due.map((o) => {
                const d = new Date(`${o.dueOn}T12:00:00Z`);
                return (
                  <li key={o.id}>
                    <Link
                      href={`/orders/${o.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-muted"
                    >
                      <span className="flex w-10 shrink-0 flex-col items-center rounded-md bg-surface-muted py-1 text-xs text-ink-muted">
                        {d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}
                        <b className="text-md font-semibold text-ink">{d.getUTCDate()}</b>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          #{o.id} · {o.customerName ?? "No customer"}
                        </span>
                        <span className="block truncate text-sm text-ink-muted">
                          {o.needToPrint > 0 ? `Need to print ${o.needToPrint}` : "Ready"} · {usd(o.totalUsd)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  children,
}: {
  label: string;
  value: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-surface px-4 py-3">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className={cn("text-2xl font-semibold tabular-nums", accent && "text-action")}>{value}</dd>
      <dd className="text-xs text-ink-muted">{children}</dd>
    </div>
  );
}
