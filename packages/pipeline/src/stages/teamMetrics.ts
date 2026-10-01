import type { Metric, SideMetrics, TeamMetrics, Tier } from "@huddle/shared";

import type { PbpRow } from "../columns.js";
import { is1, isDesignedRush, isDropback, isExplosive, isScrimmage, ratio } from "./context.js";

interface OffenseTotals {
  team: string;
  plays: number;
  epa: number;
  successN: number;
  success: number;
  dropbacks: number;
  passEpa: number;
  rushes: number;
  rushEpa: number;
  explosive: number;
  explosiveDen: number;
  sacks: number;
  thirdAtt: number;
  thirdConv: number;
  fourthAtt: number;
  fourthConv: number;
  turnovers: number;
  penalties: number;
  penaltyYards: number;
  /** Special-teams EPA from this team's perspective (kickoffs, punts, kicks). */
  stEpa: number;
}

const empty = (team: string): OffenseTotals => ({
  team,
  plays: 0,
  epa: 0,
  successN: 0,
  success: 0,
  dropbacks: 0,
  passEpa: 0,
  rushes: 0,
  rushEpa: 0,
  explosive: 0,
  explosiveDen: 0,
  sacks: 0,
  thirdAtt: 0,
  thirdConv: 0,
  fourthAtt: 0,
  fourthConv: 0,
  turnovers: 0,
  penalties: 0,
  penaltyYards: 0,
  stEpa: 0,
});

/** Offensive totals per team for the week (defense is the opponent's offense, inverted). */
export function offenseTotals(pbp: readonly PbpRow[]): Map<string, OffenseTotals> {
  const acc = new Map<string, OffenseTotals>();
  const get = (team: string): OffenseTotals => {
    let t = acc.get(team);
    if (!t) {
      t = empty(team);
      acc.set(team, t);
    }
    return t;
  };
  for (const p of pbp) {
    if (p.posteam === null || p.defteam === null) continue;
    const t = get(p.posteam);
    if (isScrimmage(p)) {
      t.plays += 1;
      t.epa += p.epa ?? 0;
      if (p.success !== null) {
        t.successN += 1;
        t.success += p.success;
      }
    }
    if (isDropback(p)) {
      t.dropbacks += 1;
      t.passEpa += p.epa ?? 0;
      t.explosiveDen += 1;
      if (is1(p.sack)) t.sacks += 1;
    }
    if (isDesignedRush(p)) {
      t.rushes += 1;
      t.rushEpa += p.epa ?? 0;
      t.explosiveDen += 1;
    }
    if (isExplosive(p) && (isDropback(p) || isDesignedRush(p))) t.explosive += 1;
    if (is1(p.third_down_converted) || is1(p.third_down_failed)) {
      t.thirdAtt += 1;
      if (is1(p.third_down_converted)) t.thirdConv += 1;
    }
    if (is1(p.fourth_down_converted) || is1(p.fourth_down_failed)) {
      t.fourthAtt += 1;
      if (is1(p.fourth_down_converted)) t.fourthConv += 1;
    }
    if (is1(p.interception) || is1(p.fumble_lost)) t.turnovers += 1;
    if (is1(p.penalty) && p.penalty_team !== null) {
      const flagged = get(p.penalty_team);
      flagged.penalties += 1;
      flagged.penaltyYards += p.penalty_yards ?? 0;
    }
    if (is1(p.special_teams_play) && p.epa !== null) {
      t.stEpa += p.epa;
      get(p.defteam).stEpa -= p.epa;
    }
  }
  return acc;
}

interface Rated {
  value: number | null;
  n: number;
}

function rate(t: OffenseTotals, key: keyof SideMetrics): Rated {
  switch (key) {
    case "epaPerPlay":
      return { value: ratio(t.epa, t.plays), n: t.plays };
    case "successRate":
      return { value: ratio(t.success, t.successN), n: t.successN };
    case "passEpaPerDropback":
      return { value: ratio(t.passEpa, t.dropbacks), n: t.dropbacks };
    case "rushEpaPerAtt":
      return { value: ratio(t.rushEpa, t.rushes), n: t.rushes };
    case "explosiveRate":
      return { value: ratio(t.explosive, t.explosiveDen), n: t.explosiveDen };
    case "sackRate":
      return { value: ratio(t.sacks, t.dropbacks), n: t.dropbacks };
    case "thirdDownRate":
      return { value: ratio(t.thirdConv, t.thirdAtt), n: t.thirdAtt };
    default:
      return { value: null, n: 0 };
  }
}

type RateKey =
  | "epaPerPlay"
  | "successRate"
  | "passEpaPerDropback"
  | "rushEpaPerAtt"
  | "explosiveRate"
  | "sackRate"
  | "thirdDownRate";

const LOWER_IS_BETTER: ReadonlySet<string> = new Set(["sackRate"]);

/** Mid-rank percentile (0-100) and dense rank (1 = best) of a team among the league that week. */
export function leaguePercentile(
  values: readonly number[],
  value: number,
  lowerIsBetter: boolean,
): { percentile: number; rank: number } {
  let below = 0;
  let equal = 0;
  let better = 0;
  for (const v of values) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
    if (lowerIsBetter ? v < value : v > value) better += 1;
  }
  const pct = values.length === 0 ? 50 : ((below + equal / 2) / values.length) * 100;
  return { percentile: lowerIsBetter ? 100 - pct : pct, rank: better + 1 };
}

function sideMetrics(team: string, totals: Map<string, OffenseTotals>): SideMetrics {
  const t = totals.get(team) ?? empty(team);
  const metric = (key: RateKey): Metric => {
    const own = rate(t, key);
    const league = [...totals.values()]
      .map((o) => rate(o, key).value)
      .filter((v): v is number => v !== null);
    const value = own.value ?? 0;
    const { percentile, rank } = leaguePercentile(league, value, LOWER_IS_BETTER.has(key));
    return { value, leaguePercentile: percentile, leagueRank: Math.min(32, rank), n: own.n };
  };
  return {
    epaPerPlay: metric("epaPerPlay"),
    successRate: metric("successRate"),
    passEpaPerDropback: metric("passEpaPerDropback"),
    rushEpaPerAtt: metric("rushEpaPerAtt"),
    explosiveRate: metric("explosiveRate"),
    sackRate: metric("sackRate"),
    thirdDownRate: metric("thirdDownRate"),
    fourthDown: { att: t.fourthAtt, conv: t.fourthConv },
    turnovers: t.turnovers,
    penalties: { count: t.penalties, yards: Math.round(t.penaltyYards) },
  };
}

export interface TeamMetricsArgs {
  season: number;
  week: number;
  gameId: string;
  tier: Tier;
  team: string;
  opponent: string;
}

/**
 * Team and opponent offensive profiles with league percentiles among the teams that played that
 * week, plus the game grade: offense EPA/play percentile 45 %, defense (opponent's offense
 * percentile inverted) 45 %, special-teams EPA percentile 10 %.
 */
export function teamMetrics(pbp: readonly PbpRow[], args: TeamMetricsArgs): TeamMetrics {
  const totals = offenseTotals(pbp);
  const team = sideMetrics(args.team, totals);
  const opponent = sideMetrics(args.opponent, totals);
  const stValues = [...totals.values()].map((t) => t.stEpa);
  const ownSt = totals.get(args.team)?.stEpa ?? 0;
  const specialTeams = leaguePercentile(stValues, ownSt, false).percentile;
  const offense = team.epaPerPlay.leaguePercentile;
  const defense = 100 - opponent.epaPerPlay.leaguePercentile;
  return {
    season: args.season,
    week: args.week,
    gameId: args.gameId,
    tier: args.tier,
    team,
    opponent,
    teamGrade: {
      offense,
      defense,
      specialTeams,
      overall: 0.45 * offense + 0.45 * defense + 0.1 * specialTeams,
    },
  };
}
