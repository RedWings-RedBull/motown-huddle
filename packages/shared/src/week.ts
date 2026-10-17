/** Week and schedule helpers shared by the site, the writer and the pipeline. Browser-safe. */

export function weekSlug(week: number): string {
  return `week-${String(week).padStart(2, "0")}`;
}

/** Newest first. */
export function byWeekDesc<T extends { season: number; week: number }>(a: T, b: T): number {
  return b.season - a.season || b.week - a.week;
}

const kickoffFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

/** Kickoff rendered in Eastern time, e.g. "Sun, Oct 11, 2026, 4:25 PM EDT". */
export function formatKickoff(iso: string): string {
  return kickoffFormat.format(new Date(iso));
}

/** "5-2", or "5-2-1" once there is a tie to show. */
export function recordText(r: { w: number; l: number; t: number }): string {
  return r.t > 0 ? `${r.w}-${r.l}-${r.t}` : `${r.w}-${r.l}`;
}
