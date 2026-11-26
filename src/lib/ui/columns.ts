/**
 * DataTable column choices (docs/DESIGN-SYSTEM.md §6): which columns a person hid,
 * remembered per device in localStorage. Pure functions so they can be unit tested.
 */

/** Reads a stored list of hidden column keys. Unknown keys and pinned columns are dropped; bad JSON = nothing hidden. */
export function parseHidden(raw: string | null, known: readonly string[], pinned: readonly string[] = []): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const out = value.filter((k): k is string => typeof k === "string" && known.includes(k) && !pinned.includes(k));
    return [...new Set(out)];
  } catch {
    return [];
  }
}

/** Shows a hidden column or hides a shown one. A pinned column never hides. */
export function toggleColumn(hidden: readonly string[], key: string, pinned: readonly string[] = []): string[] {
  if (pinned.includes(key)) return [...hidden];
  return hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
}

/** CSS that hides the chosen columns inside one table (matched by data-col). */
export function hiddenColumnsCss(tableId: string, hidden: readonly string[]): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "");
  return hidden.map((k) => `#${safe(tableId)} [data-col="${safe(k)}"]{display:none}`).join("");
}
