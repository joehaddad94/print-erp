import { EmptyState, List, ListRow, Money, PageHeader, formatWhen } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { listOrders } from "@/server/orders/service";
import { OrderRows } from "@/components/orders/order-rows";
import { recentJobs, runningJobs } from "@/server/printing/service";

function daysFromToday(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
}

export default async function TodayPage() {
  await requireUser();
  const [running, recent, orders] = await Promise.all([runningJobs(db()), recentJobs(db(), 8), listOrders(db())]);
  // T-01: open orders due within 3 days, or overdue.
  const soon = daysFromToday(3);
  const due = orders.filter((o) => !["delivered", "cancelled"].includes(o.status) && o.dueOn && o.dueOn <= soon);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Today" />
      <section aria-labelledby="printing-now" className="flex flex-col gap-2">
        <h2 id="printing-now" className="text-lg font-semibold">
          Printing now
        </h2>
        {running.length === 0 ? (
          <EmptyState title="Nothing printing" />
        ) : (
          <List label="Printing now">
            {running.map((j) => (
              <ListRow
                key={j.id}
                href={`/print/${j.id}`}
                title={j.recipeName}
                subtitle={`${j.machineName} · started ${formatWhen(j.startedAt)}`}
                trailing={<span className="font-semibold text-action">Finish</span>}
              />
            ))}
          </List>
        )}
      </section>
      <section aria-labelledby="due-soon" className="flex flex-col gap-2">
        <h2 id="due-soon" className="text-lg font-semibold">
          Orders due soon
        </h2>
        {due.length ? <OrderRows rows={due} /> : <EmptyState title="Nothing due in the next 3 days" />}
      </section>
      {recent.length ? (
        <section aria-labelledby="recent" className="flex flex-col gap-2">
          <h2 id="recent" className="text-lg font-semibold">
            Recent prints
          </h2>
          <List label="Recent prints">
            {recent.map((j) => (
              <ListRow
                key={j.id}
                href={`/print/${j.id}`}
                title={j.recipeName}
                subtitle={`${j.machineName} · ${formatWhen(j.finishedAt!)}`}
                trailing={j.jobCostUsd != null ? <Money amount={j.jobCostUsd} /> : null}
              />
            ))}
          </List>
        </section>
      ) : null}
    </div>
  );
}
