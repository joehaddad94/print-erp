/** Default "Warn when filament is below" (Settings › Defaults overrides it). */
export const LOW_FILAMENT_G = 200;

/**
 * "Low" in Stock, on Today and in the pickers: an item's own "Warn me below" wins; filament
 * otherwise uses the shop default. Other stock is never low unless it has its own level.
 */
export function isLow(s: { type: string; onHand: number; reorderLevel?: number | null }, filamentDefault: number) {
  const at = s.reorderLevel ?? (s.type === "filament" ? filamentDefault : null);
  return at != null && s.onHand < at;
}

const SWATCHES: Record<string, string> = {
  black: "#111111",
  white: "#f4f4f4",
  grey: "#8a8f96",
  gray: "#8a8f96",
  silver: "#c0c4c8",
  red: "#e11d48",
  orange: "#f97316",
  yellow: "#facc15",
  gold: "#d4a017",
  green: "#16a34a",
  blue: "#2563eb",
  navy: "#1e3a8a",
  purple: "#7c3aed",
  pink: "#ec4899",
  brown: "#7c4a21",
  beige: "#e8d9b5",
  transparent: "transparent",
  clear: "transparent",
};

/** A colour dot for a filament's colour name ("Silk gold" → gold); null when the name has no known colour. */
export function swatch(color: string | null | undefined): string | null {
  if (!color) return null;
  const words = color
    .toLowerCase()
    .split(/[^a-z]+/)
    .reverse();
  for (const w of words) if (w in SWATCHES) return SWATCHES[w]!;
  return null;
}
