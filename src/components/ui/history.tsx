import type { ReactNode } from "react";
import { Badge } from "./badge";

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Beirut" });

export function formatWhen(d: Date) {
  return when.format(d);
}

const dayTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Beirut",
});

/** "26 Nov 12:40" for lists of recent activity. */
export function shortWhen(d: Date) {
  return dayTime.format(d).replace(",", "");
}

/** D13: visible "✎ Edited <date time>" marker. */
export function EditedMarker({ at, compact }: { at: Date | null | undefined; compact?: boolean }) {
  if (!at) return null;
  if (compact)
    return (
      <span title={`Edited ${formatWhen(at)}`}>
        <Badge tone="info">✎ Edited</Badge>
      </span>
    );
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

/** Activity of one record (prototype `hist`): time left, what happened right, newest first. */
export function Timeline({ entries, empty }: { entries: { id: string; at: Date; text: ReactNode }[]; empty?: string }) {
  if (entries.length === 0) return <p className="px-4 py-4 text-sm text-ink-muted">{empty ?? "Nothing yet."}</p>;
  return (
    <ul className="divide-y divide-border text-md">
      {entries.map((e) => (
        <li key={e.id} className="flex min-h-10 items-baseline gap-4 px-4 py-2">
          <span className="w-24 shrink-0 text-sm text-ink-muted tabular-nums">{shortWhen(e.at)}</span>
          <span className="min-w-0">{e.text}</span>
        </li>
      ))}
    </ul>
  );
}
