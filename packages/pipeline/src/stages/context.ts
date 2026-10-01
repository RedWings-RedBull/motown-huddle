import type { DepthChartRow, FtnRow, PbpRow } from "../columns.js";

/** FTN charting keyed by nflverse game and play id. */
export type FtnIndex = Map<string, FtnRow>;

function ftnKey(gameId: string, playId: number): string {
  return `${gameId}:${playId}`;
}

export function indexFtn(rows: readonly FtnRow[]): FtnIndex {
  return new Map(rows.map((r) => [ftnKey(r.nflverse_game_id, r.nflverse_play_id), r]));
}

export const is1 = (v: number | null): boolean => v === 1;

/** Scrimmage plays that count for EPA/play and success rate. */
export function isScrimmage(p: PbpRow): boolean {
  return (p.play_type === "pass" || p.play_type === "run") && p.epa !== null;
}

export function isDropback(p: PbpRow): boolean {
  return is1(p.qb_dropback) && p.posteam !== null;
}

/** Kneel-downs carry rush_attempt = 1 but say nothing about the line or the back. */
export function isKneel(p: PbpRow): boolean {
  return is1(p.qb_kneel) || p.play_type === "qb_kneel";
}

/** Designed run: rush attempt that is neither a scramble nor a kneel-down. */
export function isDesignedRush(p: PbpRow): boolean {
  return is1(p.rush_attempt) && !is1(p.qb_scramble) && !isKneel(p) && p.posteam !== null;
}

/** The quarterback on a dropback: passer, or the rusher on a scramble. */
export function dropbackQb(p: PbpRow): string | null {
  return p.passer_player_id ?? (is1(p.qb_scramble) ? p.rusher_player_id : null);
}

export function isExplosive(p: PbpRow): boolean {
  const y = p.yards_gained ?? 0;
  if (is1(p.pass_attempt) && !is1(p.sack)) return y >= 20;
  if (is1(p.rush_attempt)) return y >= 10;
  return false;
}

export function tacklerIds(p: PbpRow): string[] {
  return [
    p.solo_tackle_1_player_id,
    p.solo_tackle_2_player_id,
    p.assist_tackle_1_player_id,
    p.assist_tackle_2_player_id,
    p.assist_tackle_3_player_id,
    p.assist_tackle_4_player_id,
    p.tackle_with_assist_1_player_id,
    p.tackle_with_assist_2_player_id,
  ].filter((id): id is string => id !== null);
}

/** Offensive context per team for one week (all from pbp). */
export interface TeamContext {
  team: string;
  gameId: string;
  opponent: string;
  plays: number;
  dropbacks: number;
  designedRushes: number;
  sacks: number;
  /** Share of offensive plays that were dropbacks (route / pass-rush snap estimates). */
  dropbackShare: number;
  rushShare: number;
}

export function buildTeamContexts(pbp: readonly PbpRow[]): Map<string, TeamContext> {
  const acc = new Map<string, TeamContext>();
  for (const p of pbp) {
    if (p.posteam === null || p.defteam === null) continue;
    let ctx = acc.get(p.posteam);
    if (!ctx) {
      ctx = {
        team: p.posteam,
        gameId: p.game_id,
        opponent: p.defteam,
        plays: 0,
        dropbacks: 0,
        designedRushes: 0,
        sacks: 0,
        dropbackShare: 0,
        rushShare: 0,
      };
      acc.set(p.posteam, ctx);
    }
    if (isScrimmage(p)) ctx.plays += 1;
    if (isDropback(p)) {
      ctx.dropbacks += 1;
      if (is1(p.sack)) ctx.sacks += 1;
    }
    if (isDesignedRush(p)) ctx.designedRushes += 1;
  }
  for (const ctx of acc.values()) {
    const denom = ctx.dropbacks + ctx.designedRushes;
    ctx.dropbackShare = denom === 0 ? 0 : ctx.dropbacks / denom;
    ctx.rushShare = denom === 0 ? 0 : ctx.designedRushes / denom;
  }
  return acc;
}

/** Latest depth-chart snapshot for a team at or before its kickoff (ISO strings compare lexically). */
export function depthChartSnapshot(
  rows: readonly DepthChartRow[],
  team: string,
  kickoffUtc: string,
): DepthChartRow[] {
  let latest = "";
  for (const r of rows) {
    if (r.team === team && r.dt <= kickoffUtc && r.dt > latest) latest = r.dt;
  }
  if (latest === "") return [];
  return rows.filter((r) => r.team === team && r.dt === latest);
}

export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function sum(values: readonly (number | null)[]): number {
  let s = 0;
  for (const v of values) s += v ?? 0;
  return s;
}
