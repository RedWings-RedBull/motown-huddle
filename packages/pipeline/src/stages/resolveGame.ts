import type { GamesRow } from "../columns.js";
import { kickoffUtc } from "../time.js";

/** The configured team's schedule row for one week, with the derived kickoff instant. */
export interface ResolvedGame {
  season: number;
  week: number;
  gameId: string;
  side: "home" | "away";
  opponent: string;
  kickoffUtc: string;
  row: GamesRow;
}

export function toResolvedGame(team: string, row: GamesRow): ResolvedGame {
  const side = row.home_team === team ? "home" : "away";
  return {
    season: row.season,
    week: row.week,
    gameId: row.game_id,
    side,
    opponent: side === "home" ? row.away_team : row.home_team,
    kickoffUtc: kickoffUtc(row.gameday, row.gametime),
    row,
  };
}

/** Whether nflverse has posted a final score (`total` is empty until the game ends). */
export function isFinal(row: GamesRow): boolean {
  return row.total !== null;
}

function teamRows(games: readonly GamesRow[], team: string, season: number): GamesRow[] {
  return games
    .filter((g) => g.season === season && (g.home_team === team || g.away_team === team))
    .sort((a, b) => a.week - b.week);
}

/**
 * Explicit week: the team's row for that week, or null on a bye (no row).
 */
export function resolveWeek(
  games: readonly GamesRow[],
  team: string,
  season: number,
  week: number,
): ResolvedGame | null {
  const row = teamRows(games, team, season).find((g) => g.week === week);
  return row ? toResolvedGame(team, row) : null;
}

/**
 * `--week auto`: the latest team game whose kickoff is in the past and whose final score has been
 * posted. Null when the season has not produced a completed game yet.
 */
export function resolveLatest(
  games: readonly GamesRow[],
  team: string,
  season: number,
  now: Date,
): ResolvedGame | null {
  const nowMs = now.getTime();
  let latest: ResolvedGame | null = null;
  for (const row of teamRows(games, team, season)) {
    if (!isFinal(row)) continue;
    const resolved = toResolvedGame(team, row);
    if (Date.parse(resolved.kickoffUtc) >= nowMs) continue;
    if (latest === null || resolved.week > latest.week) latest = resolved;
  }
  return latest;
}

/** All kickoffs of a league week, used to window the depth-chart snapshot for every team. */
export function weekKickoffs(
  games: readonly GamesRow[],
  season: number,
  week: number,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const g of games) {
    if (g.season !== season || g.week !== week) continue;
    const kick = kickoffUtc(g.gameday, g.gametime);
    out.set(g.home_team, kick);
    out.set(g.away_team, kick);
  }
  return out;
}
