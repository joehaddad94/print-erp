import { Badge } from "./badge";

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Beirut" });

export function formatWhen(d: Date) {
  return when.format(d);
}

/** D13: visible "✎ Edited <date time>" marker. */
export function EditedMarker({ at }: { at: Date | null | undefined }) {
  if (!at) return null;
  return <Badge tone="info">✎ Edited {formatWhen(at)}</Badge>;
}

type Entry = {
  id: number;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  editedAt: Date;
  action: "edit" | "delete";
};

const show = (v: unknown) => (v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** One entry's change history (D13), newest first. */
export function HistoryList({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) return <p className="text-sm text-ink-muted">No changes since it was entered.</p>;
  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-surface text-sm">
      {entries.map((e) => (
        <li key={e.id} className="px-3 py-2">
          <p className="text-xs text-ink-muted">{formatWhen(e.editedAt)}</p>
          {e.action === "delete" ? (
            <p className="font-semibold text-danger">Deleted</p>
          ) : (
            <p>
              <span className="font-semibold">{e.field.replace(/_/g, " ")}</span>: {show(e.oldValue)} →{" "}
              {show(e.newValue)}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
