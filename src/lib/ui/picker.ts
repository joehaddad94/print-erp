/**
 * SearchPicker logic (docs/DESIGN-SYSTEM.md §6): match, group and keyboard-move.
 * Pure so the rules are unit tested; the component only renders the result.
 */

export type PickerItem = {
  id: string;
  label: string;
  /** Second line: version, key facts. */
  sub?: string;
  /** Extra words that should match (product, material), never shown. */
  keywords?: string;
  /** Can't be picked (e.g. out of stock), still listed so the person sees why. */
  disabled?: boolean;
  /** Short label on the right, e.g. "Low". */
  badge?: string;
};

export type PickerGroup = { label: string; items: PickerItem[] };

const norm = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/** Every word of the query must appear in the label, sub line or keywords (any order, accents ignored). */
export function matches(item: PickerItem, query: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm(`${item.label} ${item.sub ?? ""} ${item.keywords ?? ""}`);
  return words.every((w) => hay.includes(w));
}

/** "Recently used" first (in recent order), then everything else A to Z. Empty groups are dropped. */
export function groupItems(
  items: readonly PickerItem[],
  query: string,
  recentIds: readonly string[] = [],
  recentLabel = "Recently used",
): PickerGroup[] {
  const hits = items.filter((i) => matches(i, query));
  const recent = recentIds.map((id) => hits.find((i) => i.id === id)).filter((i): i is PickerItem => !!i);
  const rest = hits
    .filter((i) => !recentIds.includes(i.id))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true }));
  return [
    { label: recentLabel, items: recent },
    { label: recent.length ? "All" : "", items: rest },
  ].filter((g) => g.items.length);
}

/**
 * Arrow-key movement over the flat list: skips disabled rows and wraps.
 * `from` = -1 when nothing is active. Returns -1 when no row can be picked.
 */
export function moveActive(items: readonly PickerItem[], from: number, dir: 1 | -1): number {
  const n = items.length;
  if (!n) return -1;
  let i = from;
  for (let step = 0; step < n; step++) {
    i = (((i + dir) % n) + n) % n;
    if (from === -1 && dir === -1 && step === 0) i = n - 1;
    if (!items[i]!.disabled) return i;
  }
  return -1;
}
