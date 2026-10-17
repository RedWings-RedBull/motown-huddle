/** Helpers shared by the game routes, the games index and the home page. */

import { weekSlug } from "@huddle/shared";

export { byWeekDesc, formatKickoff, weekSlug } from "@huddle/shared";

/** Content-collection id for a week, e.g. "2026/week-03". */
export function weekId(season: number, week: number): string {
  return `${season}/${weekSlug(week)}`;
}

export function gameHref(season: number, week: number): string {
  return `/games/${season}/${weekSlug(week)}/`;
}

export function resultWord(result: "W" | "L" | "T"): string {
  if (result === "W") return "Win";
  if (result === "L") return "Loss";
  return "Tie";
}
