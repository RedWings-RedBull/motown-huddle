/** Helpers shared by the game routes, the games index, the next-game page and the home page. */

import { teamConfig, weekSlug } from "@huddle/shared";

export { byWeekDesc, formatKickoff, recordText, weekSlug } from "@huddle/shared";

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

/** "vs" at home, "at" on the road. */
export function venueWord(side: "home" | "away"): string {
  return side === "home" ? "vs" : "at";
}

interface ScoredGame {
  home: { score: number };
  away: { score: number };
  team: { side: "home" | "away" };
}

/** Our score and the opponent's, whichever side of the box score we were on. */
export function teamScores(game: ScoredGame): { teamScore: number; oppScore: number } {
  const home = game.team.side === "home";
  return {
    teamScore: home ? game.home.score : game.away.score,
    oppScore: home ? game.away.score : game.home.score,
  };
}

interface GameDetails {
  venue: {
    stadium: string | null;
    roof: string | null;
    surface: string | null;
    temp: number | null;
    wind: number | null;
  };
  line: { spread: number | null; total: number | null };
}

/** The line from our side, e.g. "DET -6.5" or "DET +3". */
function spreadText(spread: number): string {
  return spread < 0 ? `${teamConfig.team} ${spread}` : `${teamConfig.team} +${spread}`;
}

/** Venue and betting-line chips for the game-details strip, skipping whatever is unknown. */
export function gameChips({ venue, line }: GameDetails): string[] {
  return [
    venue.stadium,
    venue.roof,
    venue.surface,
    venue.temp !== null ? `${Math.round(venue.temp)}°F` : null,
    venue.wind !== null ? `wind ${Math.round(venue.wind)} mph` : null,
    line.spread !== null ? `line ${spreadText(line.spread)}` : null,
    line.total !== null ? `total ${line.total}` : null,
  ].filter((chip): chip is string => chip !== null);
}
