import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Stat = {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  /** Value in the accent colour (e.g. profit). */
  accent?: boolean;
  /** Value in the warning colour (e.g. money owed). */
  warn?: boolean;
};

/**
 * KPI strip (prototype `.kstrip`): 2 to 4 numbers joined in one bordered row, 2 × 2 on phones.
 * Used at the top of Today, money lists and detail pages.
 */
export function StatStrip({ items, label }: { items: Stat[]; label?: string }) {
  return (
    <dl
      aria-label={label}
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border",
        items.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
      )}
    >
      {items.map((s) => (
        <div key={s.label} className="flex flex-col gap-0.5 bg-surface px-3 py-2.5 lg:px-4 lg:py-3">
          <dt className="text-xs font-medium text-ink-muted">{s.label}</dt>
          <dd
            className={cn(
              "text-xl font-semibold tracking-tight tabular-nums lg:text-2xl",
              s.accent && "text-action",
              s.warn && "text-warning",
            )}
          >
            {s.value}
          </dd>
          {s.note ? <dd className="hidden text-xs text-ink-muted sm:block">{s.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/**
 * Stat tiles (prototype `.stats`): separate cards, the first one can be filled with the accent
 * colour (`feature`) for the number the screen is about. Recipe page.
 */
export function StatTiles({ items, feature }: { items: Stat[]; feature?: boolean }) {
  return (
    <dl className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
      {items.map((s, i) => {
        const feat = feature && i === 0;
        return (
          <div
            key={s.label}
            className={cn(
              "flex flex-col rounded-lg border px-3 py-3 lg:px-4 lg:py-3.5",
              feat ? "border-action bg-action text-action-ink" : "border-border bg-surface",
            )}
          >
            <dt className={cn("text-sm", feat ? "opacity-90" : "text-ink-muted")}>{s.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{s.value}</dd>
            {s.note ? <dd className={cn("mt-0.5 text-xs", feat ? "opacity-90" : "text-ink-muted")}>{s.note}</dd> : null}
          </div>
        );
      })}
    </dl>
  );
}

/** Label / value list inside a panel (prototype `kv`): label left, value right. */
export function KeyValues({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="flex flex-col text-md">
      {items.map(([k, v], i) => (
        <div key={i} className="flex min-h-9 items-baseline justify-between gap-4 py-1.5">
          <dt className="text-ink-muted">{k}</dt>
          <dd className="text-right tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One line of a cost breakdown (prototype `.costline`), and the bold total line. */
export function CostLine({
  label,
  value,
  strong,
  divided,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
  /** Starts a new group: a rule above (e.g. the price lines after the cost). */
  divided?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 py-1 text-md",
        strong && "font-semibold",
        divided && "mt-2 border-t border-border pt-3",
      )}
    >
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

export function CostTotal({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-3">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-2xl font-bold tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}
