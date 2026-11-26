"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/components/shell/icons";
import { hiddenColumnsCss, parseHidden, toggleColumn } from "@/lib/ui/columns";

const CHANGED = "ps-cols-changed";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Columns button of a wide DataTable: hide or show columns, remembered on this device. */
export function ColumnsMenu({
  tableId,
  columns,
  pinned,
}: {
  tableId: string;
  columns: { key: string; header: string }[];
  pinned: string[];
}) {
  const storageKey = `ps-cols:${tableId}`;
  const raw = useSyncExternalStore(
    subscribe,
    () => read(storageKey),
    () => null,
  );
  const hidden = parseHidden(
    raw,
    columns.map((c) => c.key),
    pinned,
  );

  const flip = (key: string) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(toggleColumn(hidden, key, pinned)));
    } catch {
      // Storage blocked: the choice can't be kept.
    }
    window.dispatchEvent(new Event(CHANGED));
  };

  return (
    <details className="relative">
      <summary className="flex min-h-control cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-ink-soft hover:bg-surface-muted">
        <Icon name="columns" size={15} />
        Columns{hidden.length ? ` (${hidden.length} hidden)` : ""}
      </summary>
      <fieldset className="absolute right-0 z-30 mt-1 flex w-56 flex-col rounded-md border border-border bg-surface p-1.5 shadow-overlay">
        <legend className="sr-only">Columns to show</legend>
        {columns.map((c) => (
          <label
            key={c.key}
            className="flex min-h-control cursor-pointer items-center gap-2 rounded-sm px-2 text-md hover:bg-surface-muted"
          >
            <input
              type="checkbox"
              checked={!hidden.includes(c.key)}
              disabled={pinned.includes(c.key)}
              onChange={() => flip(c.key)}
              className="size-4 accent-action"
            />
            {c.header}
          </label>
        ))}
      </fieldset>
      <style>{hiddenColumnsCss(tableId, hidden)}</style>
    </details>
  );
}
