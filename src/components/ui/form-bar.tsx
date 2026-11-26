import type { ReactNode } from "react";

/**
 * Save bar at the end of a form. On phones it stays pinned above the tab bar,
 * so the save button is always one tap away; on desktop it sits after the last card.
 */
export function FormBar({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <div className="sticky bottom-16 z-20 -mx-4 flex flex-row-reverse items-center gap-2 border-t border-border bg-surface px-4 py-3 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:flex-row lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
      <div className="flex-1 lg:flex-none [&>*]:w-full lg:[&>*]:w-auto">{primary}</div>
      {secondary}
    </div>
  );
}
