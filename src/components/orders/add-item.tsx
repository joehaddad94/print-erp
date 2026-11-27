"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/shell/icons";
import { Button } from "@/components/ui";

/** Order › Items footer (prototype): "+ Add item" opens the product, quantity and price fields in place. */
export function AddItem({ hint, children }: { hint: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
      {open ? (
        <>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Add item</h3>
            <Button variant="quiet" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
          {children}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button variant="secondary" onClick={() => setOpen(true)}>
            <Icon name="plus" size={15} />
            Add item
          </Button>
          <span className="text-xs text-ink-muted">{hint}</span>
        </div>
      )}
    </div>
  );
}
