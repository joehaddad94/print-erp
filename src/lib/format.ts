/** "1 h 8 min" / "45 min" from seconds; "—" when unknown. Shared by server and client screens. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}
