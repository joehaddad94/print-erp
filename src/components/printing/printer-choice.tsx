"use client";

import { Icon } from "@/components/shell/icons";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";

export type PrinterOption = {
  id: number;
  name: string;
  model?: string | null;
  nozzleMm?: number | null;
  bedXMm?: number | null;
  bedYMm?: number | null;
  busy?: boolean;
};

const specs = (p: PrinterOption) =>
  [p.nozzleMm != null ? `${p.nozzleMm} mm nozzle` : null, p.bedXMm && p.bedYMm ? `${p.bedXMm} × ${p.bedYMm} bed` : null]
    .filter(Boolean)
    .join(" · ") ||
  p.model ||
  "";

/**
 * Printer field (Joe, Nov 26): with one active printer it is a card already picked for you;
 * with 2 to 6, radio cards showing Free or Busy (a busy printer can't be picked).
 */
export function PrinterChoice({
  name,
  printers,
  value,
  onChange,
  legend = "Printer",
}: {
  name: string;
  printers: PrinterOption[];
  value: string;
  onChange: (id: string) => void;
  legend?: string;
}) {
  if (printers.length === 1) {
    const p = printers[0]!;
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-soft">{legend}</span>
        <div className="flex items-center gap-3 rounded-md border border-border-strong bg-surface px-3 py-2.5">
          <input type="hidden" name={name} value={p.id} />
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-muted text-ink-muted">
            <Icon name="machines" size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{p.name}</span>
            <span className="block truncate text-sm text-ink-muted">{specs(p)}</span>
          </span>
          {p.busy ? <Badge tone="warning">Busy</Badge> : <Badge tone="success">Free</Badge>}
        </div>
      </div>
    );
  }
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="pb-1.5 text-sm font-medium text-ink-soft">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {printers.map((p) => (
          <label
            key={p.id}
            className={cn(
              "relative flex min-h-12 items-center gap-3 rounded-md border border-border-strong bg-surface px-3 py-2",
              p.busy
                ? "cursor-not-allowed opacity-60"
                : "cursor-pointer has-checked:border-action has-checked:bg-action-soft",
            )}
          >
            <input
              type="radio"
              name={name}
              value={p.id}
              disabled={p.busy}
              checked={value === String(p.id)}
              onChange={() => onChange(String(p.id))}
              className="peer absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
            <span
              aria-hidden
              className="grid size-4 shrink-0 place-items-center rounded-full border border-border-strong peer-checked:border-action peer-focus-visible:outline-2 peer-focus-visible:outline-action peer-checked:after:size-2 peer-checked:after:rounded-full peer-checked:after:bg-action"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="block truncate text-sm text-ink-muted">{specs(p)}</span>
            </span>
            {p.busy ? <Badge tone="warning">Busy</Badge> : <Badge tone="success">Free</Badge>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
