import { connection } from "next/server";
import { cache } from "react";
import { db } from "@/db";
import { sidebarBadges } from "@/server/today/service";

const badges = cache(async () => {
  await connection();
  return sidebarBadges(db());
});

/** Prototype sidebar pip: open orders due within 3 days (quotes left out). */
export async function OrdersDueBadge() {
  const { due } = await badges();
  if (!due) return null;
  return (
    // Hidden from screen readers so the link keeps its plain name; Today lists what is due.
    <span
      aria-hidden="true"
      className="ml-auto rounded-full bg-rail-accent px-1.5 text-xs leading-normal font-semibold text-rail lg:rail-collapsed:sr-only"
    >
      {due} due
    </span>
  );
}

/** Prototype sidebar dot on Stock: some filament is below its reorder level. */
export async function LowStockDot() {
  const { low } = await badges();
  if (!low) return null;
  return (
    <span
      aria-hidden="true"
      title="Low filament"
      className="ml-auto size-2 shrink-0 rounded-full bg-warning lg:rail-collapsed:absolute lg:rail-collapsed:top-2 lg:rail-collapsed:right-2"
    />
  );
}
