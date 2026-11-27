/** "1 h 8 min" / "45 min" from seconds; "—" when unknown. Shared by server and client screens. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

/** "26 Nov" (Beirut time), the short date used in tables. Adds the year when it isn't this year. */
export function shortDate(d: Date | string | null | undefined, now = new Date()): string {
  if (d == null) return "—";
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d) : d;
  const year = (x: Date) => x.toLocaleDateString("en-GB", { year: "numeric", timeZone: "Asia/Beirut" });
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(year(date) === year(now) ? {} : { year: "numeric" }),
    timeZone: "Asia/Beirut",
  });
}
