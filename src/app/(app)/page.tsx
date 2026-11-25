import Link from "next/link";
import { EmptyState, List, ListRow, Money, PageHeader, buttonClass, formatWhen } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { recentJobs, runningJobs } from "@/server/printing/service";

export default async function TodayPage() {
  await requireUser();
  const [running, recent] = await Promise.all([runningJobs(db()), recentJobs(db(), 8)]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Today"
        action={
          <Link href="/print" className={buttonClass("primary")}>
            Start print
          </Link>
        }
      />
      <section aria-labelledby="printing-now" className="flex flex-col gap-2">
        <h2 id="printing-now" className="text-lg font-bold">
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
      {recent.length ? (
        <section aria-labelledby="recent" className="flex flex-col gap-2">
          <h2 id="recent" className="text-lg font-bold">
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
