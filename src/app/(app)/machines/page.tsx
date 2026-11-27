import { Icon } from "@/components/shell/icons";
import {
  Badge,
  DataTable,
  EditedMarker,
  EmptyState,
  PageHeader,
  Panel,
  buttonClass,
  type Column,
} from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { lastEdited } from "@/server/edits/engine";
import { listMachines } from "@/server/machines/service";

const hours = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
type Row = Awaited<ReturnType<typeof listMachines>>[number] & { editedAt: Date | null };

/** $0.17, or $0.067 for wear under 10 cents, so small numbers keep their meaning. */
const wear = (n: number) => `$${n.toFixed(n < 0.1 ? 3 : 2)}`;

const status = (m: Row) =>
  m.status === "active" ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Retired</Badge>;

const columns: Column<Row>[] = [
  {
    key: "name",
    header: "Name",
    cell: (m) => (
      <span className="inline-flex items-center gap-2">
        {m.name}
        <EditedMarker at={m.editedAt} compact />
      </span>
    ),
  },
  { key: "model", header: "Model", cell: (m) => m.model ?? <span className="text-ink-muted">—</span> },
  { key: "status", header: "Status", cell: status },
  {
    key: "hours",
    header: "Hours",
    numeric: true,
    cell: (m) => (m.type === "printer" ? `${hours.format(m.hoursUsed)} h` : "—"),
  },
  {
    key: "wear",
    header: "Wear per hour",
    numeric: true,
    cell: (m) =>
      m.type !== "printer" ? (
        "—"
      ) : m.costPerHourUsd == null ? (
        <span className="text-warning">Cost not set</span>
      ) : (
        wear(m.costPerHourUsd)
      ),
  },
];

/** Machines (prototype /machines): your printers; the price you paid is recorded as a purchase. */
export default async function MachinesPage() {
  await requireUser();
  const list = await listMachines(db());
  const edited = await lastEdited(
    db(),
    "machines",
    list.map((m) => m.id),
  );
  const rows: Row[] = list.map((m) => ({ ...m, editedAt: edited.get(m.id) ?? null }));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Machines"
        description="Your printers. The price you paid is recorded as a purchase."
        action={
          <Link href="/purchases/new?category=machine" className={buttonClass("primary")}>
            <Icon name="plus" size={16} />
            Add machine
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No machines yet">Add machine records what you paid and adds the printer.</EmptyState>
      ) : (
        <Panel title="Machines" titleId="machines-table" flush>
          <DataTable
            id="machines"
            label="Machines"
            columns={columns}
            rows={rows}
            rowKey={(m) => m.id}
            rowHref={(m) => `/machines/${m.id}`}
            phoneRow={(m) => ({
              title: m.name,
              subtitle:
                m.type === "printer"
                  ? `${hours.format(m.hoursUsed)} h printed · ${m.costPerHourUsd == null ? "cost not set" : `${wear(m.costPerHourUsd)}/h wear`}`
                  : (m.model ?? "Equipment"),
              trailing: status(m),
              badge: m.editedAt ? <EditedMarker at={m.editedAt} compact /> : undefined,
            })}
          />
        </Panel>
      )}
    </div>
  );
}
