import { Link } from "@/components/ui/link";
import { Button, Card, EmptyState, PageHeader, formatWhen } from "@/components/ui";
import { db } from "@/db";
import { changeHistory, HISTORY_TABLES } from "@/server/assembly/service";
import { requireUser } from "@/server/auth/session";

const show = (v: unknown) => (v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

/** D13 Change history: every edit and delete, newest first, filtered by kind and date. */
export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  await requireUser();
  const q = await searchParams;
  const table = one(q.table) && HISTORY_TABLES[one(q.table)!] ? one(q.table) : undefined;
  const from = one(q.from)?.match(/^\d{4}-\d{2}-\d{2}$/) ? one(q.from) : undefined;
  const to = one(q.to)?.match(/^\d{4}-\d{2}-\d{2}$/) ? one(q.to) : undefined;
  const rows = await changeHistory(db(), { table, from, to });
  const control = "control px-3 text-ink";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Change history" />
      <Card>
        <form className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="col-span-2 flex flex-col gap-1.5 text-sm font-semibold md:col-span-1" htmlFor="h-table">
            What
            <select id="h-table" name="table" defaultValue={table ?? ""} className={control}>
              <option value="">Everything</option>
              {Object.entries(HISTORY_TABLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold" htmlFor="h-from">
            From
            <input id="h-from" type="date" name="from" defaultValue={from} className={control} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold" htmlFor="h-to">
            To
            <input id="h-to" type="date" name="to" defaultValue={to} className={control} />
          </label>
          <Button type="submit" variant="secondary" className="col-span-2 self-end md:col-span-1">
            Show
          </Button>
        </form>
      </Card>
      {rows.length === 0 ? (
        <EmptyState title="No changes">Edits and deletes show up here.</EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface text-sm" aria-label="Changes">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-0.5 px-3 py-2">
              <p className="text-xs text-ink-muted">
                {formatWhen(r.editedAt)} · {r.tableLabel}{" "}
                {r.href ? (
                  <Link
                    className="inline-flex min-h-control min-w-control items-center justify-center font-semibold text-action underline"
                    href={r.href}
                  >
                    #{r.rowId}
                  </Link>
                ) : (
                  `#${r.rowId}`
                )}
                {r.reason ? ` · ${r.reason}` : ""}
              </p>
              {r.action === "delete" ? (
                <p className="font-semibold text-danger">Deleted</p>
              ) : (
                <p>
                  <span className="font-semibold">{r.field.replace(/_/g, " ")}</span>: {show(r.oldValue)} →{" "}
                  {show(r.newValue)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
