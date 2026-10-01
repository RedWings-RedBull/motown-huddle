import type { GameSummary, Tier } from "@huddle/shared";

import { ValidationError } from "../errors.js";
import type { ResolvedGame } from "./resolveGame.js";

export function gameSummary(game: ResolvedGame, tier: Tier): GameSummary {
  const row = game.row;
  if (row.home_score === null || row.away_score === null) {
    throw new ValidationError(`${game.gameId} has no final score yet`);
  }
  const own = game.side === "home" ? row.home_score : row.away_score;
  const theirs = game.side === "home" ? row.away_score : row.home_score;
  return {
    season: game.season,
    week: game.week,
    gameId: game.gameId,
    kickoffUtc: game.kickoffUtc,
    home: { team: row.home_team, score: Math.trunc(row.home_score) },
    away: { team: row.away_team, score: Math.trunc(row.away_score) },
    team: {
      side: game.side,
      opponent: game.opponent,
      result: own > theirs ? "W" : own < theirs ? "L" : "T",
    },
    overtime: row.overtime === 1,
    venue: {
      stadium: row.stadium ?? "",
      roof: row.roof ?? "",
      surface: row.surface ?? "",
      temp: row.temp,
      wind: row.wind,
    },
    line: { spread: row.spread_line, total: row.total_line },
    tier,
  };
}
