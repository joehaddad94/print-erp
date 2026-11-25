"use client";

import { useLinkStatus } from "next/link";

/**
 * Thin progress bar across the top of the screen while the link it sits in is
 * loading. Must be rendered inside a <Link>. Fixed-position, so no layout shift;
 * the moving stripe only exists while pending (no idle animation, no overflow).
 */
export function PendingBar() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      data-pending={pending || undefined}
      className="group pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden"
    >
      <span className="hidden h-full w-2/5 bg-action group-data-pending:block group-data-pending:animate-progress" />
    </span>
  );
}
