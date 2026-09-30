import type { WinProbability } from "@huddle/shared";

import type { PbpRow } from "../columns.js";

export interface WinProbabilityArgs {
  season: number;
  week: number;
  gameId: string;
  team: string;
  side: "home" | "away";
}

/**
 * Win probability from the configured team's perspective on every play with a model value:
 * nflverse `wp` is the possession team's, so the team's is `wp` when it has the ball and `1 - wp`
 * otherwise (kickoffs list the receiving team as posteam, which keeps this consistent).
 */
export function winProbability(pbp: readonly PbpRow[], args: WinProbabilityArgs): WinProbability {
  const points: WinProbability["points"] = [];
  for (const p of pbp) {
    if (p.game_id !== args.gameId || p.wp === null || p.posteam === null) continue;
    const own = p.posteam === args.team;
    const home = p.total_home_score ?? 0;
    const away = p.total_away_score ?? 0;
    points.push({
      playId: p.play_id,
      secondsRemaining: Math.max(0, Math.trunc(p.game_seconds_remaining ?? 0)),
      qtr: Math.max(1, Math.min(6, Math.trunc(p.qtr ?? 1))),
      teamWp: clamp01(own ? p.wp : 1 - p.wp),
      vegasTeamWp: p.vegas_wp === null ? null : clamp01(own ? p.vegas_wp : 1 - p.vegas_wp),
      teamScore: Math.trunc(args.side === "home" ? home : away),
      oppScore: Math.trunc(args.side === "home" ? away : home),
    });
  }
  points.sort((a, b) => a.playId - b.playId);
  return { season: args.season, week: args.week, gameId: args.gameId, points };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
