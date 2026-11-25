"use client";

import { useLinkStatus } from "next/link";

/**
 * Thin progress bar across the top of the screen while the link it sits in is
 * loading. Must be rendered inside a <Link>. Always in the DOM (no layout shift).
 */
export function PendingBar() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      data-pending={pending || undefined}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden opacity-0 transition-opacity delay-100 data-pending:opacity-100"
    >
      <span className="block h-full w-2/5 animate-progress bg-action" />
    </span>
  );
}
