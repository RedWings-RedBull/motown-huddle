import type { AggressionSeason, Decision, LeagueIndexRow } from "@huddle/shared";
import { distanceBucket, fieldBin, wpBucket } from "@huddle/shared";

import type { PbpRow } from "../columns.js";

export interface FourthDownPlay {
  season: number;
  week: number;
  gameId: string;
  playId: number;
  team: string;
  opponent: string;
  qtr: number;
  /** Seconds left in the game. */
  secondsRemaining: number;
  clock: string;
  yardline100: number;
  ydstogo: number;
  scoreDiff: number;
  wp: number;
  decision: Decision;
  result: string;
  epa: number | null;
  wpa: number | null;
  forced: boolean;
  desc: string;
}

const FORCED_SECONDS = 240;

function decisionOf(row: PbpRow): Decision | null {
  if (row.play_type === "pass" || row.play_type === "run") return "go";
  if (row.play_type === "punt") return "punt";
  if (row.play_type === "field_goal") return "fg";
  return null;
}

function resultOf(row: PbpRow, decision: Decision): string {
  if (decision === "go") {
    if (row.touchdown === 1) return "touchdown";
    if (row.fourth_down_converted === 1) return "converted";
    if (row.interception === 1) return "interception";
    if (row.fumble_lost === 1) return "fumble";
    return "failed";
  }
  if (decision === "fg") return row.field_goal_result ?? "unknown";
  if (row.touchback === 1) return "touchback";
  return `punt ${row.kick_distance ?? 0} yds`;
}

/** Fourth-down decisions (go, punt, field goal) from regular-season plays; kneels and aborted snaps excluded. */
export function fourthDownPlays(pbp: readonly PbpRow[]): FourthDownPlay[] {
  const out: FourthDownPlay[] = [];
  for (const row of pbp) {
    if (row.down !== 4 || row.posteam === null || row.defteam === null) continue;
    if (row.qb_kneel === 1) continue;
    const decision = decisionOf(row);
    if (decision === null) continue;
    if (row.wp === null || row.yardline_100 === null || row.ydstogo === null || row.qtr === null)
      continue;
    const secondsRemaining = row.game_seconds_remaining ?? 0;
    const scoreDiff = row.score_differential ?? 0;
    const forced = row.qtr >= 4 && secondsRemaining <= FORCED_SECONDS && scoreDiff < 0;
    out.push({
      season: row.season,
      week: row.week,
      gameId: row.game_id,
      playId: row.play_id,
      team: row.posteam,
      opponent: row.defteam,
      qtr: row.qtr,
      secondsRemaining,
      clock: row.time ?? "",
      yardline100: row.yardline_100,
      ydstogo: row.ydstogo,
      scoreDiff,
      wp: row.wp,
      decision,
      result: resultOf(row, decision),
      epa: row.epa,
      wpa: row.wpa,
      forced,
      desc: row.desc ?? "",
    });
  }
  return out;
}

const bucketKey = (p: FourthDownPlay): string =>
  `${distanceBucket(p.ydstogo)}|${fieldBin(p.yardline100)}|${wpBucket(p.wp)}`;

interface Cell {
  decisions: number;
  goes: number;
}

/**
 * Fourth-Down Aggression Index for one season: the situation-weighted gap between a team's go rate
 * and the league's, in percentage points. Forced decisions (trailing late) are excluded, and every
 * club is scored the same way so the ranking is like for like.
 */
export function aggressionIndex(plays: readonly FourthDownPlay[]): Map<string, AggressionSeason> {
  const eligible = plays.filter((p) => !p.forced);
  const league = new Map<string, Cell>();
  const byTeam = new Map<string, Map<string, Cell>>();
  const totals = new Map<string, { decisions: number; goes: number; conversions: number }>();
  const bump = (m: Map<string, Cell>, key: string, go: boolean): void => {
    const c = m.get(key) ?? { decisions: 0, goes: 0 };
    c.decisions += 1;
    if (go) c.goes += 1;
    m.set(key, c);
  };
  for (const p of eligible) {
    const go = p.decision === "go";
    const key = bucketKey(p);
    bump(league, key, go);
    let t = byTeam.get(p.team);
    if (!t) {
      t = new Map();
      byTeam.set(p.team, t);
    }
    bump(t, key, go);
    const tot = totals.get(p.team) ?? { decisions: 0, goes: 0, conversions: 0 };
    tot.decisions += 1;
    if (go) {
      tot.goes += 1;
      if (p.result === "converted" || p.result === "touchdown") tot.conversions += 1;
    }
    totals.set(p.team, tot);
  }
  const leagueDecisions = eligible.length;
  const leagueGoes = eligible.filter((p) => p.decision === "go").length;
  const leagueGoRate = leagueDecisions === 0 ? 0 : leagueGoes / leagueDecisions;

  const rows: { team: string; index: number; goRate: number }[] = [];
  for (const [team, cells] of byTeam) {
    let index = 0;
    for (const [key, lg] of league) {
      const share = lg.decisions / leagueDecisions;
      const leagueRate = lg.goes / lg.decisions;
      const own = cells.get(key);
      if (!own) continue;
      index += share * (own.goes / own.decisions - leagueRate);
    }
    const tot = totals.get(team) ?? { decisions: 0, goes: 0, conversions: 0 };
    rows.push({
      team,
      index: index * 100,
      goRate: tot.decisions === 0 ? 0 : tot.goes / tot.decisions,
    });
  }
  rows.sort((a, b) => b.index - a.index || a.team.localeCompare(b.team));

  const season = plays[0]?.season ?? 0;
  const out = new Map<string, AggressionSeason>();
  rows.forEach((r, i) => {
    const tot = totals.get(r.team) ?? { decisions: 0, goes: 0, conversions: 0 };
    out.set(r.team, {
      season,
      index: r.index,
      rank: i + 1,
      goRate: r.goRate,
      leagueGoRate,
      decisions: tot.decisions,
      goes: tot.goes,
      conversions: tot.conversions,
    });
  });
  return out;
}

export function leagueRows(index: Map<string, AggressionSeason>): LeagueIndexRow[] {
  return [...index.entries()]
    .map(([team, a]) => ({ team, index: a.index, rank: a.rank, goRate: a.goRate }))
    .sort((a, b) => a.rank - b.rank);
}
