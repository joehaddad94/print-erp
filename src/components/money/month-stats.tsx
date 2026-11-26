import { cn } from "@/lib/cn";

/** A strip of 2 to 4 numbers at the top of a money screen (same look as Today). */
export function StatStrip({ items }: { items: { label: string; value: string; note?: string }[] }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border",
        items.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
      )}
    >
      {items.map((s) => (
        <div key={s.label} className="flex flex-col gap-0.5 bg-surface px-4 py-3">
          <dt className="text-xs font-medium text-ink-muted">{s.label}</dt>
          <dd className="text-2xl font-semibold tabular-nums">{s.value}</dd>
          {s.note ? <dd className="text-xs text-ink-muted">{s.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
