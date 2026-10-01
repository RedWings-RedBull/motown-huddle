import { qualifies, specFor } from "@huddle/grades";
import {
  metricsForPool,
  type MetricSamples,
  type MetricValues,
  type PlayerRow,
  type Pool,
  type Tier,
  type UnitRow,
} from "@huddle/shared";

import type { DepthChartRow, PbpRow, SnapCountRow, StatsPlayerRow } from "../columns.js";
import type { PlayerInfo } from "../crosswalk.js";
import type { WeekInputs } from "../inputs.js";
import { fgMakeProbability } from "../models/fgTable.js";
import {
  buildTeamContexts,
  depthChartSnapshot,
  dropbackQb,
  indexFtn,
  is1,
  isDesignedRush,
  isDropback,
  ratio,
  tacklerIds,
  type FtnIndex,
  type TeamContext,
} from "./context.js";
import { classifyPool, unitForPool } from "./pools.js";

/** Per-player play-by-play accumulators (all pools share one bag; unused fields stay zero). */
interface Acc {
  dropbacks: number;
  qbEpa: number;
  dbSuccess: number;
  dbSuccessN: number;
  cpoe: number;
  cpoeN: number;
  qbSacks: number;
  intWorthy: number;
  fumblesLost: number;
  carries: number;
  rushSuccess: number;
  rushSuccessN: number;
  explosiveRuns: number;
  targets: number;
  croe: number;
  croeN: number;
  receptions: number;
  yacOe: number;
  yacOeN: number;
  catchable: number;
  drops: number;
  contested: number;
  contestedCaught: number;
  runStops: number;
  pbus: number;
  ints: number;
  fgAtt: number;
  fgPoe: number;
  xpAtt: number;
  xpMade: number;
  kickoffs: number;
  touchbacks: number;
  punts: number;
  puntEpa: number;
  returns: number;
  returnEpa: number;
  returnYards: number;
  penalties: { type: string; yards: number }[];
}

const emptyAcc = (): Acc => ({
  dropbacks: 0,
  qbEpa: 0,
  dbSuccess: 0,
  dbSuccessN: 0,
  cpoe: 0,
  cpoeN: 0,
  qbSacks: 0,
  intWorthy: 0,
  fumblesLost: 0,
  carries: 0,
  rushSuccess: 0,
  rushSuccessN: 0,
  explosiveRuns: 0,
  targets: 0,
  croe: 0,
  croeN: 0,
  receptions: 0,
  yacOe: 0,
  yacOeN: 0,
  catchable: 0,
  drops: 0,
  contested: 0,
  contestedCaught: 0,
  runStops: 0,
  pbus: 0,
  ints: 0,
  fgAtt: 0,
  fgPoe: 0,
  xpAtt: 0,
  xpMade: 0,
  kickoffs: 0,
  touchbacks: 0,
  punts: 0,
  puntEpa: 0,
  returns: 0,
  returnEpa: 0,
  returnYards: 0,
  penalties: [],
});

const SHORT_KICKOFF = "Kickoff Short of Landing Zone";

/** A back qualifies on carries (the RB spec's n) or, failing that, on this many touches. */
const RB_TOUCH_RULE = 8;

/** Returns that move a scrimmage player who did not qualify in his own pool into RET. */
const RET_RETURNS = specFor("RET").threshold.n;

/** Walks every play of the week once and credits players. Exported for the K/P/RET unit tests. */
export function accumulatePlays(pbp: readonly PbpRow[], ftn: FtnIndex): Map<string, Acc> {
  const acc = new Map<string, Acc>();
  const get = (id: string): Acc => {
    let a = acc.get(id);
    if (!a) {
      a = emptyAcc();
      acc.set(id, a);
    }
    return a;
  };
  for (const p of pbp) {
    const chart = ftn.get(`${p.game_id}:${p.play_id}`);
    if (isDropback(p)) {
      const qb = dropbackQb(p);
      if (qb !== null) {
        const a = get(qb);
        a.dropbacks += 1;
        a.qbEpa += p.qb_epa ?? p.epa ?? 0;
        if (p.success !== null) {
          a.dbSuccess += p.success;
          a.dbSuccessN += 1;
        }
        if (is1(p.pass_attempt) && !is1(p.sack) && p.cpoe !== null) {
          a.cpoe += p.cpoe;
          a.cpoeN += 1;
        }
        // A sack counts against the QB unless FTN charted it as not the QB's fault.
        if (is1(p.sack) && chart?.is_qb_fault_sack !== false) a.qbSacks += 1;
        if (chart?.is_interception_worthy === true) a.intWorthy += 1;
        if (is1(p.fumble_lost) && p.fumbled_1_player_id === qb) a.fumblesLost += 1;
      }
    }
    if (isDesignedRush(p) && p.rusher_player_id !== null) {
      const a = get(p.rusher_player_id);
      a.carries += 1;
      if (p.success !== null) {
        a.rushSuccess += p.success;
        a.rushSuccessN += 1;
      }
      if ((p.yards_gained ?? 0) >= 10) a.explosiveRuns += 1;
    }
    if (is1(p.pass_attempt) && !is1(p.sack) && p.receiver_player_id !== null) {
      const a = get(p.receiver_player_id);
      a.targets += 1;
      const caught = is1(p.complete_pass);
      if (p.cp !== null) {
        a.croe += (caught ? 1 : 0) - p.cp;
        a.croeN += 1;
      }
      if (caught) {
        a.receptions += 1;
        if (p.yac_epa !== null && p.xyac_epa !== null) {
          a.yacOe += p.yac_epa - p.xyac_epa;
          a.yacOeN += 1;
        }
      }
      if (chart?.is_catchable_ball === true) a.catchable += 1;
      if (chart?.is_drop === true) a.drops += 1;
      if (chart?.is_contested_ball === true) {
        a.contested += 1;
        if (caught) a.contestedCaught += 1;
      }
    }
    if (isDesignedRush(p) && p.success === 0) {
      for (const id of new Set(tacklerIds(p))) get(id).runStops += 1;
    }
    for (const id of [p.pass_defense_1_player_id, p.pass_defense_2_player_id]) {
      if (id !== null) get(id).pbus += 1;
    }
    if (p.interception_player_id !== null) get(p.interception_player_id).ints += 1;
    if (is1(p.field_goal_attempt) && p.kicker_player_id !== null && p.kick_distance !== null) {
      const a = get(p.kicker_player_id);
      a.fgAtt += 1;
      const made = p.field_goal_result === "made" ? 3 : 0;
      a.fgPoe += made - 3 * fgMakeProbability(p.kick_distance);
    }
    if (is1(p.extra_point_attempt) && p.kicker_player_id !== null) {
      const a = get(p.kicker_player_id);
      a.xpAtt += 1;
      if (p.extra_point_result === "good") a.xpMade += 1;
    }
    if (is1(p.kickoff_attempt) && p.kicker_player_id !== null) {
      const a = get(p.kicker_player_id);
      a.kickoffs += 1;
      if (is1(p.touchback) && p.penalty_type !== SHORT_KICKOFF) a.touchbacks += 1;
    }
    if (is1(p.punt_attempt) && p.punter_player_id !== null) {
      const a = get(p.punter_player_id);
      a.punts += 1;
      a.puntEpa += p.epa ?? 0;
    }
    creditReturn(p, get);
    if (is1(p.penalty) && p.penalty_player_id !== null) {
      get(p.penalty_player_id).penalties.push({
        type: p.penalty_type ?? "Penalty",
        yards: p.penalty_yards ?? 0,
      });
    }
  }
  return acc;
}

/**
 * Kickoffs list the receiving team as posteam (epa already from the returner's side); punts list
 * the punting team, so the return team's EPA is the negation.
 */
function creditReturn(p: PbpRow, get: (id: string) => Acc): void {
  if (is1(p.touchback)) return;
  if (
    is1(p.kickoff_attempt) &&
    p.kickoff_returner_player_id !== null &&
    !is1(p.kickoff_fair_catch)
  ) {
    const a = get(p.kickoff_returner_player_id);
    a.returns += 1;
    a.returnEpa += p.epa ?? 0;
    a.returnYards += p.return_yards ?? 0;
  } else if (is1(p.punt_attempt) && p.punt_returner_player_id !== null && !is1(p.punt_fair_catch)) {
    const a = get(p.punt_returner_player_id);
    a.returns += 1;
    a.returnEpa -= p.epa ?? 0;
    a.returnYards += p.return_yards ?? 0;
  }
}

interface Candidate {
  gsisId: string;
  team: string;
  snap?: SnapCountRow | undefined;
  stats?: StatsPlayerRow | undefined;
  chart?: DepthChartRow | undefined;
  info?: PlayerInfo | undefined;
}

/**
 * Pool evidence from a team's chart: the lowest pos_rank row, preferring offense/defense over
 * special teams unless the player took only special-teams snaps (a pure returner or specialist).
 */
function chartRowFor(
  rows: readonly DepthChartRow[],
  gsisId: string,
  pureSt: boolean,
): DepthChartRow | undefined {
  const ranked = rows.filter((r) => r.gsis_id === gsisId).sort((a, b) => a.pos_rank - b.pos_rank);
  const st = ranked.find((r) => r.pos_grp === "Special Teams" && r.pos_abb !== "H");
  const scrimmage = ranked.find((r) => r.pos_grp !== "Special Teams");
  return pureSt ? (st ?? scrimmage) : (scrimmage ?? st);
}

export interface Extracted {
  players: PlayerRow[];
  units: UnitRow[];
  contexts: Map<string, TeamContext>;
}

/**
 * Computes raw metric values for every player league-wide who touched the field that week, plus
 * the OL unit row for every team, keyed exactly by METRICS. Metrics whose input is missing are
 * null; final-tier (PFR) keys are omitted in the provisional tier.
 */
export function extract(inputs: WeekInputs): Extracted {
  const ftn = indexFtn(inputs.ftn);
  const acc = accumulatePlays(inputs.pbp, ftn);
  const contexts = buildTeamContexts(inputs.pbp);
  const ngsPass = new Map(inputs.ngs.passing.map((r) => [r.player_gsis_id, r]));
  const ngsRush = new Map(inputs.ngs.rushing.map((r) => [r.player_gsis_id, r]));
  const ngsRec = new Map(inputs.ngs.receiving.map((r) => [r.player_gsis_id, r]));
  const pfr = inputs.pfr;
  const gsis = (pfrId: string): string | null => inputs.crosswalk.gsisForPfr(pfrId);
  const pfrPass = new Map(pfr?.pass.flatMap((r) => keyed(gsis(r.pfr_player_id), r)) ?? []);
  const pfrRush = new Map(pfr?.rush.flatMap((r) => keyed(gsis(r.pfr_player_id), r)) ?? []);
  const pfrDef = new Map(pfr?.def.flatMap((r) => keyed(gsis(r.pfr_player_id), r)) ?? []);

  const charts = new Map<string, DepthChartRow[]>();
  for (const [team, kickoff] of inputs.kickoffs) {
    charts.set(team, depthChartSnapshot(inputs.depthCharts, team, kickoff));
  }

  // Universe: every snap-count row with a gsis_id, plus stat rows for players without one.
  const candidates = new Map<string, Candidate>();
  for (const snap of inputs.snaps) {
    const id = gsis(snap.pfr_player_id);
    if (id === null) continue;
    candidates.set(id, { gsisId: id, team: snap.team, snap });
  }
  for (const stats of inputs.stats) {
    const existing = candidates.get(stats.player_id);
    if (existing) existing.stats = stats;
    else candidates.set(stats.player_id, { gsisId: stats.player_id, team: stats.team, stats });
  }
  for (const c of candidates.values()) {
    c.info = inputs.crosswalk.byGsis.get(c.gsisId);
    const pureSt = (c.snap?.offense_snaps ?? 0) + (c.snap?.defense_snaps ?? 0) === 0;
    c.chart = chartRowFor(charts.get(c.team) ?? [], c.gsisId, pureSt);
  }

  const players: PlayerRow[] = [];
  const qbIds = new Set<string>();
  for (const c of [...candidates.values()].sort((a, b) => a.gsisId.localeCompare(b.gsisId))) {
    let pool = classifyPool({
      depthChart: c.chart ? { posAbb: c.chart.pos_abb, posGrp: c.chart.pos_grp } : undefined,
      info: c.info,
      statsPosition: c.stats?.position,
      snapPosition: c.snap?.position,
    });
    if (pool === null) continue;
    const ctx = contexts.get(c.team);
    const opp = ctx ? contexts.get(ctx.opponent) : undefined;
    const a = acc.get(c.gsisId) ?? emptyAcc();
    const inputsFor = (unit: "offense" | "defense" | "st"): ValueInputs => ({
      a,
      stats: c.stats,
      snaps: unitSnaps(c.snap, unit).snaps,
      ctx,
      opp,
      ngsPass: ngsPass.get(c.gsisId),
      ngsRush: ngsRush.get(c.gsisId),
      ngsRec: ngsRec.get(c.gsisId),
      pfrPass: pfrPass.get(c.gsisId),
      pfrRush: pfrRush.get(c.gsisId),
      pfrDef: pfrDef.get(c.gsisId),
    });
    let snaps = unitSnaps(c.snap, unitForPool(pool));
    let computed = computeValues(pool, inputsFor(unitForPool(pool)));
    // A scrimmage player who fielded the returns but did not qualify in his own pool (a third
    // back with two kickoff returns) is graded as a returner rather than shown ungraded on KR.
    if (
      pool !== "RET" &&
      !qualifies(specFor(pool), computed.n, snaps.snaps) &&
      (a.returns >= RET_RETURNS ||
        (a.returns >= 1 && listedReturner(charts.get(c.team) ?? [], c.gsisId)))
    ) {
      pool = "RET";
      snaps = unitSnaps(c.snap, "st");
      computed = computeValues(pool, inputsFor("st"));
    }
    if (pool === "QB") qbIds.add(c.gsisId);
    const { values, samples } = restrictToTier(
      pool,
      inputs.tier,
      computed.values,
      computed.samples,
    );
    players.push({
      gsisId: c.gsisId,
      name: c.info?.name ?? c.stats?.player_display_name ?? c.snap?.player ?? c.gsisId,
      jersey: c.info?.jersey ?? null,
      position: c.chart?.pos_abb ?? c.info?.position ?? c.snap?.position ?? pool,
      pool,
      team: c.team,
      snaps: snaps.snaps,
      snapPct: snaps.pct,
      n: computed.n,
      values,
      samples,
      penalties: a.penalties,
    });
  }

  const units = [...contexts.values()]
    .sort((x, y) => x.team.localeCompare(y.team))
    .map((ctx) => olUnit(ctx, inputs, ftn, pfrPass, pfrRush, qbIds));
  return { players, units, contexts };
}

function listedReturner(rows: readonly DepthChartRow[], gsisId: string): boolean {
  return rows.some((r) => r.gsis_id === gsisId && (r.pos_abb === "KR" || r.pos_abb === "PR"));
}

function keyed<T>(id: string | null, row: T): [string, T][] {
  return id === null ? [] : [[id, row]];
}

function unitSnaps(
  snap: SnapCountRow | undefined,
  unit: "offense" | "defense" | "st",
): { snaps: number; pct: number } {
  if (!snap) return { snaps: 0, pct: 0 };
  const pick = (n: number | null, pct: number | null) => ({
    snaps: Math.trunc(n ?? 0),
    pct: Math.min(1, Math.max(0, pct ?? 0)),
  });
  if (unit === "offense") return pick(snap.offense_snaps, snap.offense_pct);
  if (unit === "defense") return pick(snap.defense_snaps, snap.defense_pct);
  return pick(snap.st_snaps, snap.st_pct);
}

interface ValueInputs {
  a: Acc;
  stats: StatsPlayerRow | undefined;
  snaps: number;
  ctx: TeamContext | undefined;
  opp: TeamContext | undefined;
  ngsPass: { completion_percentage_above_expectation: number | null } | undefined;
  ngsRush: { rush_yards_over_expected_per_att: number | null } | undefined;
  ngsRec: { avg_yac_above_expectation: number | null } | undefined;
  pfrPass: { passing_bad_throw_pct: number | null } | undefined;
  pfrRush:
    | {
        carries: number | null;
        rushing_yards_after_contact_avg: number | null;
        rushing_broken_tackles: number | null;
      }
    | undefined;
  pfrDef:
    | {
        def_targets: number | null;
        def_completion_pct: number | null;
        def_yards_allowed: number | null;
        def_yards_allowed_per_tgt: number | null;
        def_receiving_td_allowed: number | null;
        def_passer_rating_allowed: number | null;
        def_times_blitzed: number | null;
        def_pressures: number | null;
        def_missed_tackle_pct: number | null;
      }
    | undefined;
}

interface Computed {
  n: number;
  values: MetricValues;
  samples: MetricSamples;
}

/** All metric values for one pool; keys not set here fall back to null / 0 in restrictToTier. */
function computeValues(pool: Pool, v: ValueInputs): Computed {
  const { a, stats, snaps, ctx, opp } = v;
  const values: MetricValues = {};
  const samples: MetricSamples = {};
  const set = (key: string, value: number | null, n: number) => {
    values[key] = value !== null && Number.isFinite(value) ? value : null;
    samples[key] = Math.max(0, Math.round(n));
  };
  const carries = stats?.carries ?? a.carries;
  const targets = stats?.targets ?? a.targets;
  switch (pool) {
    case "QB": {
      const n = a.dropbacks;
      set("qb.epaPerDropback", ratio(a.qbEpa, n), n);
      set("qb.successRate", ratio(a.dbSuccess, a.dbSuccessN), a.dbSuccessN);
      set("qb.cpoe", ratio(a.cpoe, a.cpoeN), a.cpoeN);
      set("qb.sackRate", ratio(a.qbSacks, n), n);
      set("qb.turnoverWorthyRate", ratio(a.intWorthy + a.fumblesLost, n), n);
      set("qb.badThrowPct", v.pfrPass?.passing_bad_throw_pct ?? null, n);
      set("qb.ngsCpoe", v.ngsPass?.completion_percentage_above_expectation ?? null, n);
      return { n, values, samples };
    }
    case "RB": {
      const touches = carries + (stats?.receptions ?? a.receptions);
      // "6 carries or 8 touches": n is carries when they qualify on their own, else touches when
      // the touch rule qualifies, else carries (so the engine's n >= 6 is exactly the rule).
      const carryRule = specFor("RB").threshold.n;
      const n = carries >= carryRule ? carries : touches >= RB_TOUCH_RULE ? touches : carries;
      set("rb.rushEpaPerAtt", optionalRatio(stats?.rushing_epa, carries), carries);
      set("rb.successRate", ratio(a.rushSuccess, a.rushSuccessN), a.rushSuccessN);
      const ryoe = v.ngsRush?.rush_yards_over_expected_per_att ?? null;
      set("rb.ryoePerAtt", ryoe ?? ratio(a.explosiveRuns, a.carries), carries);
      const contact =
        v.pfrRush && v.pfrRush.rushing_yards_after_contact_avg !== null
          ? v.pfrRush.rushing_yards_after_contact_avg +
            (ratio(v.pfrRush.rushing_broken_tackles ?? 0, v.pfrRush.carries ?? carries) ?? 0)
          : null;
      set("rb.contact", contact, carries);
      set("rb.recEpaPerTarget", optionalRatio(stats?.receiving_epa, targets), targets);
      return { n, values, samples };
    }
    case "WR":
    case "TE": {
      const k = pool === "WR" ? "wr" : "te";
      const estRoutes = snaps * (ctx?.dropbackShare ?? 0);
      set(`${k}.recEpaPerTarget`, optionalRatio(stats?.receiving_epa, targets), targets);
      set(`${k}.yardsPerEstRoute`, optionalRatio(stats?.receiving_yards, estRoutes), estRoutes);
      set(`${k}.targetShare`, stats?.target_share ?? null, targets);
      set(`${k}.catchRateOverExpected`, ratio(a.croe, a.croeN), a.croeN);
      const yac = v.ngsRec?.avg_yac_above_expectation ?? null;
      set(`${k}.yacOverExpected`, yac ?? ratio(a.yacOe, a.yacOeN), a.receptions);
      set(`${k}.dropRate`, ratio(a.drops, a.catchable), a.catchable);
      set(`${k}.contestedCatchRate`, ratio(a.contestedCaught, a.contested), a.contested);
      return { n: targets, values, samples };
    }
    case "OL":
      return { n: snaps, values, samples };
    case "EDGE":
    case "IDL": {
      const k = pool === "EDGE" ? "edge" : "idl";
      const passRushSnaps = snaps * (opp?.dropbackShare ?? 0);
      const runSnaps = snaps * (opp?.rushShare ?? 0);
      set(
        `${k}.pressureRate`,
        optionalRatio(v.pfrDef?.def_pressures, passRushSnaps),
        passRushSnaps,
      );
      set(`${k}.sacks`, stats?.def_sacks ?? 0, snaps);
      set(`${k}.qbHits`, stats?.def_qb_hits ?? 0, snaps);
      set(`${k}.tfl`, stats?.def_tackles_for_loss ?? 0, snaps);
      set(`${k}.runStopRate`, ratio(a.runStops, runSnaps), runSnaps);
      set(`${k}.missedTacklePct`, v.pfrDef?.def_missed_tackle_pct ?? null, snaps);
      return { n: snaps, values, samples };
    }
    case "LB": {
      const runSnaps = snaps * (opp?.rushShare ?? 0);
      set("lb.runStopRate", ratio(a.runStops, runSnaps), runSnaps);
      const tackles = (stats?.def_tackles_solo ?? 0) + 0.5 * (stats?.def_tackle_assists ?? 0);
      set("lb.tacklesPerSnap", ratio(tackles, snaps), snaps);
      set("lb.tflPlusSacks", (stats?.def_tackles_for_loss ?? 0) + (stats?.def_sacks ?? 0), snaps);
      set("lb.missedTacklePct", v.pfrDef?.def_missed_tackle_pct ?? null, snaps);
      const d = v.pfrDef;
      const tgts = d?.def_targets ?? 0;
      const coverage =
        d &&
        tgts >= 2 &&
        d.def_yards_allowed_per_tgt !== null &&
        d.def_passer_rating_allowed !== null
          ? (d.def_yards_allowed_per_tgt * 10 + d.def_passer_rating_allowed) / 2
          : null;
      set("lb.coverage", coverage, tgts);
      const blitzes = d?.def_times_blitzed ?? 0;
      set("lb.blitzPressureRate", d ? ratio(d.def_pressures ?? 0, blitzes) : null, blitzes);
      return { n: snaps, values, samples };
    }
    case "CB":
    case "S": {
      const k = pool === "CB" ? "cb" : "s";
      const d = v.pfrDef;
      const tgts = d?.def_targets ?? 0;
      const coverageSnaps = snaps * (opp?.dropbackShare ?? 0);
      // The four coverage metrics carry def_targets as their sample: the engine scores them at
      // the 50th percentile below 3 targets (SAMPLE_RULES in @huddle/grades).
      set(`${k}.yardsPerCoverageSnap`, optionalRatio(d?.def_yards_allowed, coverageSnaps), tgts);
      set(`${k}.passerRatingAllowed`, d?.def_passer_rating_allowed ?? null, tgts);
      set(`${k}.completionPctAllowed`, d?.def_completion_pct ?? null, tgts);
      set(`${k}.ballProduction`, ratio(a.ints + a.pbus, coverageSnaps), coverageSnaps);
      set(`${k}.missedTacklePct`, d?.def_missed_tackle_pct ?? null, snaps);
      set(`${k}.tdAllowed`, d ? (d.def_receiving_td_allowed ?? 0) : null, tgts);
      return { n: snaps, values, samples };
    }
    case "K": {
      set("k.fgPointsOverExpected", a.fgAtt === 0 ? null : a.fgPoe, a.fgAtt);
      set("k.xpRate", ratio(a.xpMade, a.xpAtt), a.xpAtt);
      set("k.kickoffTouchbackRate", ratio(a.touchbacks, a.kickoffs), a.kickoffs);
      return { n: a.fgAtt + a.xpAtt, values, samples };
    }
    case "P": {
      const punts = stats?.pt_att ?? a.punts;
      set("p.netAvg", optionalRatio(stats?.pt_net_yards, punts), punts);
      set("p.inside20Rate", optionalRatio(stats?.pt_inside_20, punts), punts);
      set("p.puntEpa", a.punts === 0 ? null : a.puntEpa, a.punts);
      return { n: a.punts, values, samples };
    }
    case "RET": {
      set("ret.returnEpa", a.returns === 0 ? null : a.returnEpa, a.returns);
      set("ret.yardsPerReturn", ratio(a.returnYards, a.returns), a.returns);
      return { n: a.returns, values, samples };
    }
  }
}

/** Null (component dropped) when the source row or column is missing, never a silent 0. */
function optionalRatio(numerator: number | null | undefined, denominator: number): number | null {
  if (numerator === undefined || numerator === null) return null;
  return ratio(numerator, denominator);
}

/** Exactly the METRICS keys of the pool for the tier: computed values, else null / 0. */
export function restrictToTier(
  pool: Pool,
  tier: Tier,
  values: MetricValues,
  samples: MetricSamples,
): { values: MetricValues; samples: MetricSamples } {
  const outV: MetricValues = {};
  const outS: MetricSamples = {};
  for (const def of metricsForPool(pool)) {
    if (def.tier === "final" && tier !== "final") continue;
    outV[def.key] = values[def.key] ?? null;
    outS[def.key] = samples[def.key] ?? 0;
  }
  return { values: outV, samples: outS };
}

/** Line-credited yards: 0-4 full, 5-10 half (capped at 7), negatives at 1.2x. */
export function adjustedLineYards(yards: number): number {
  if (yards < 0) return yards * 1.2;
  if (yards <= 4) return yards;
  return 4 + (Math.min(yards, 10) - 4) * 0.5;
}

function olUnit(
  ctx: TeamContext,
  inputs: WeekInputs,
  ftn: FtnIndex,
  pfrPass: Map<string, { times_pressured: number | null; team: string }>,
  pfrRush: Map<
    string,
    { rushing_yards_before_contact: number | null; carries: number | null; team: string }
  >,
  qbIds: ReadonlySet<string>,
): UnitRow {
  let sacksNotQbFault = 0;
  let vsFourDropbacks = 0;
  let vsFourDisruptions = 0;
  let stuffs = 0;
  let aly = 0;
  for (const p of inputs.pbp) {
    if (p.posteam !== ctx.team) continue;
    const chart = ftn.get(`${p.game_id}:${p.play_id}`);
    if (isDropback(p)) {
      if (is1(p.sack) && chart?.is_qb_fault_sack !== true) sacksNotQbFault += 1;
      const rushers = chart?.n_pass_rushers ?? 0;
      if (rushers > 0 && rushers <= 4) {
        vsFourDropbacks += 1;
        if (is1(p.sack) || is1(p.qb_hit)) vsFourDisruptions += 1;
      }
    }
    if (isDesignedRush(p)) {
      const y = p.yards_gained ?? 0;
      if (y <= 0) stuffs += 1;
      aly += adjustedLineYards(y);
    }
  }
  const values: MetricValues = {
    "ol.sackRate": ratio(sacksNotQbFault, ctx.dropbacks),
    "ol.protectionVsFour": ratio(vsFourDisruptions, vsFourDropbacks),
    "ol.stuffRate": ratio(stuffs, ctx.designedRushes),
    "ol.adjustedLineYards": ratio(aly, ctx.designedRushes),
  };
  const samples: MetricSamples = {
    "ol.sackRate": ctx.dropbacks,
    "ol.protectionVsFour": vsFourDropbacks,
    "ol.stuffRate": ctx.designedRushes,
    "ol.adjustedLineYards": ctx.designedRushes,
  };
  if (inputs.tier === "final") {
    let pressured = 0;
    let anyPass = false;
    for (const r of pfrPass.values()) {
      if (r.team !== ctx.team) continue;
      anyPass = true;
      pressured += r.times_pressured ?? 0;
    }
    let ybc = 0;
    let pfrCarries = 0;
    for (const [id, r] of pfrRush) {
      // PFR counts kneels and scrambles as quarterback carries; neither says anything about the line.
      if (r.team !== ctx.team || qbIds.has(id)) continue;
      ybc += r.rushing_yards_before_contact ?? 0;
      pfrCarries += r.carries ?? 0;
    }
    values["ol.pressureRateAllowed"] = anyPass ? ratio(pressured, ctx.dropbacks) : null;
    samples["ol.pressureRateAllowed"] = ctx.dropbacks;
    values["ol.yardsBeforeContact"] = ratio(ybc, pfrCarries);
    samples["ol.yardsBeforeContact"] = pfrCarries;
  }
  const restricted = restrictToTier("OL", inputs.tier, values, samples);
  return {
    team: ctx.team,
    n: ctx.dropbacks + ctx.designedRushes,
    values: restricted.values,
    samples: restricted.samples,
  };
}
