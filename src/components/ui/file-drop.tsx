"use client";

import { forwardRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/shell/icons";
import { cn } from "@/lib/cn";

const size = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/**
 * File picker as a drop zone (prototype `.drop`): dashed box "Drop a .gcode file or click to pick
 * one". Once a file is chosen it shows as a card with its name, size and status, and a Change button.
 * The real <input type="file"> stays in the page (labelled) so keyboard, screen readers and tests work.
 */
export const FileDrop = forwardRef<
  HTMLInputElement,
  {
    id: string;
    label: string;
    accept: string;
    hint: ReactNode;
    file: File | null;
    /** Line under the file name, e.g. "Creality Print · read OK". */
    status?: ReactNode;
    onFile: (f: File | null) => void;
  }
>(function FileDrop({ id, label, accept, hint, file, status, onFile }, ref) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={cn(
        "relative rounded-lg bg-surface",
        file && !over ? "border border-border" : "border-2 border-dashed",
        over ? "border-action bg-action-soft" : file ? "" : "border-border-strong",
      )}
    >
      <input
        ref={ref}
        id={id}
        type="file"
        accept={accept}
        aria-label={label}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        className="peer absolute inset-0 size-full cursor-pointer opacity-0"
      />
      {file ? (
        <div className="pointer-events-none flex items-center gap-3 p-4 peer-focus-visible:outline-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-muted text-ink-muted">
            <Icon name="recipes" size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{file.name}</span>
            <span className="block text-sm text-ink-muted">
              {size(file.size)}
              {status ? <> · {status}</> : null}
            </span>
          </span>
          <span className="text-sm font-medium text-action">Change</span>
        </div>
      ) : (
        <div className="pointer-events-none flex flex-col items-center gap-1.5 px-4 py-6 text-center text-ink-muted">
          <Icon name="upload" size={22} />
          <span className="font-medium text-ink">Drop a {accept} file or click to pick one</span>
          <span className="text-sm">{hint}</span>
        </div>
      )}
    </div>
  );
});
