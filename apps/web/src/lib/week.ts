/** Helpers shared by the game routes, the games index and the home page. */

export function weekSlug(week: number): string {
  return `week-${String(week).padStart(2, "0")}`;
}

/** Content-collection id for a week, e.g. "2026/week-03". */
export function weekId(season: number, week: number): string {
  return `${season}/${weekSlug(week)}`;
}

export function gameHref(season: number, week: number): string {
  return `/games/${season}/${weekSlug(week)}/`;
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

/** Kickoff rendered in Eastern time at build time; no client JS. */
export function formatKickoff(iso: string): string {
  return kickoffFormat.format(new Date(iso));
}

export function resultWord(result: "W" | "L" | "T"): string {
  if (result === "W") return "Win";
  if (result === "L") return "Loss";
  return "Tie";
}
