import { EditedMarker, EmptyState, List, ListRow, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { lastEdited } from "@/server/edits/engine";
import { listMachines } from "@/server/machines/service";

const hours = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export default async function MachinesPage() {
  await requireUser();
  const rows = await listMachines(db());
  const edited = await lastEdited(
    db(),
    "machines",
    rows.map((m) => m.id),
  );
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Machines" />
      {rows.length === 0 ? (
        <EmptyState title="No machines yet">Buy one through Add expense, category Machine.</EmptyState>
      ) : (
        <List label="Machines">
          {rows.map((m) => (
            <ListRow
              key={m.id}
              href={`/machines/${m.id}`}
              title={m.name}
              subtitle={[
                m.model,
                m.type === "printer" && m.expectedLifeHours
                  ? `${hours.format(m.hoursUsed)} of ${hours.format(m.expectedLifeHours)} h`
                  : null,
                m.status === "retired" ? "Retired" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              trailing={
                m.type === "printer" ? (
                  <span className="text-sm tabular-nums">
                    {m.costPerHourUsd == null ? (
                      <span className="text-warning">Cost not set</span>
                    ) : (
                      `$${m.costPerHourUsd.toFixed(3)}/h`
                    )}
                  </span>
                ) : null
              }
              badge={edited.get(m.id) ? <EditedMarker at={edited.get(m.id)} /> : null}
            />
          ))}
        </List>
      )}
    </div>
  );
}
