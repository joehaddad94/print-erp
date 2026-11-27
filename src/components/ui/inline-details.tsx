"use client";

import { useCallback, type ReactNode } from "react";
import { InlineEdit } from "./inline-edit";

export type InlineRow = {
  field: string;
  label: string;
  /** Small muted line under the label, e.g. "EDL and generator averaged". */
  note?: ReactNode;
  value: string;
  options?: { value: string; label: string }[];
  prefix?: string;
  suffix?: string;
  inputMode?: "text" | "decimal" | "numeric" | "email" | "tel";
  wide?: boolean;
  placeholder?: string;
};

type Save = (field: string, value: string) => Promise<{ ok: true; value?: string } | { ok: false; error: string }>;

/**
 * Details panel of a record (prototype `.kv.ie-kv`): label left, click-to-edit value right.
 * `save` is a server action bound to the record, called with the field and the typed text.
 */
export function InlineDetails({ rows, save, footer }: { rows: InlineRow[]; save: Save; footer?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col">
        {rows.map((r) => (
          <Row key={r.field} row={r} save={save} />
        ))}
      </dl>
      {footer ? <p className="text-xs text-ink-muted">{footer}</p> : null}
    </div>
  );
}

function Row({ row, save }: { row: InlineRow; save: Save }) {
  const { field } = row;
  const saveField = useCallback((v: string) => save(field, v), [save, field]);
  return (
    <div className="flex min-h-10 items-start justify-between gap-4 py-1.5">
      <dt className="pt-0.5 text-md text-ink-muted">
        {row.label}
        {row.note ? <span className="block text-xs">{row.note}</span> : null}
      </dt>
      <dd className="text-right text-md">
        <InlineEdit
          label={row.label.toLowerCase()}
          value={row.value}
          save={saveField}
          options={row.options}
          prefix={row.prefix}
          suffix={row.suffix}
          inputMode={row.inputMode}
          wide={row.wide}
          placeholder={row.placeholder}
        />
      </dd>
    </div>
  );
}
