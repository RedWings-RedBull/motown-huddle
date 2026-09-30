/**
 * Generates a schema-valid, deterministic synthetic week so a clean clone renders without the
 * network. The real pipeline overwrites every file it writes here.
 *
 *   pnpm exec tsx apps/web/scripts/make-fixture.ts
 *
 * Every number below is invented (seeded PRNG, no real box score). Player names are placeholders
 * drawn from the configured team's recent rosters; jersey numbers are not authoritative.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { binFor, shrink } from "@huddle/grades";
import {
  type Bin,
  type Component,
  GameSummary,
  type GameSummary as GameSummaryT,
  Grades,
  type Grades as GradesT,
  KeyPlays,
  type KeyPlays as KeyPlaysT,
  LeagueBaselines,
  type LeagueBaselines as LeagueBaselinesT,
  Manifest,
  type Manifest as ManifestT,
  type MetricDef,
  metricsForPool,
  type PlayerGrade,
  type Pool,
  type SideMetrics,
  type Slot,
  type SlotGrade,
  TeamMetrics,
  type TeamMetrics as TeamMetricsT,
  teamConfig,
  type Unit,
  WeekMeta,
  type WeekMeta as WeekMetaT,
  WinProbability,
  type WinProbability as WinProbabilityT,
} from "@huddle/shared";

import { weekSlug } from "../src/lib/week";

const SEASON = 2026;
const WEEK = 3;
const OPPONENT = "NYJ";
const GAME_ID = `${SEASON}_${String(WEEK).padStart(2, "0")}_${OPPONENT}_${teamConfig.team}`;
const TIER = "final" as const;
const OFF_SNAPS = 66;
const DEF_SNAPS = 68;

/* ------------------------------------------------------------------ helpers */

/** mulberry32: tiny seeded PRNG so reruns are byte-identical. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(20260927);
const round3 = (x: number): number => Math.round(x * 1000) / 1000;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
const weekDir = join(dataDir, String(SEASON), weekSlug(WEEK));
mkdirSync(weekDir, { recursive: true });

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(sortKeys(value), null, 2)}\n`, "utf8");
  console.log(`wrote ${path}`);
}

/* ------------------------------------------------------------------ pools and weights */

const POOL_INFO: Record<Pool, { n: number; threshold: string; k: number }> = {
  QB: { n: 32, threshold: "14+ dropbacks", k: 15 },
  RB: { n: 58, threshold: "6+ carries or 8+ touches", k: 8 },
  WR: { n: 96, threshold: "15+ offensive snaps or 3+ targets", k: 5 },
  TE: { n: 44, threshold: "15+ offensive snaps or 3+ targets", k: 5 },
  OL: { n: 32, threshold: "one unit per team", k: 0 },
  EDGE: { n: 78, threshold: "15+ defensive snaps", k: 25 },
  IDL: { n: 70, threshold: "15+ defensive snaps", k: 25 },
  LB: { n: 60, threshold: "20+ defensive snaps", k: 25 },
  CB: { n: 88, threshold: "20+ defensive snaps", k: 25 },
  S: { n: 66, threshold: "20+ defensive snaps", k: 25 },
  K: { n: 32, threshold: "1+ kick", k: 3 },
  P: { n: 32, threshold: "1+ punt", k: 3 },
  RET: { n: 50, threshold: "2+ returns", k: 4 },
};

/** Weights per metric key (sum to 1 per pool). Mirrors the methodology; the engine owns the truth. */
const WEIGHTS: Record<string, number> = {
  "qb.epaPerDropback": 0.35,
  "qb.successRate": 0.15,
  "qb.cpoe": 0.15,
  "qb.sackRate": 0.1,
  "qb.turnoverWorthyRate": 0.1,
  "qb.badThrowPct": 0.1,
  "qb.ngsCpoe": 0.05,
  "rb.rushEpaPerAtt": 0.3,
  "rb.successRate": 0.2,
  "rb.ryoePerAtt": 0.15,
  "rb.contact": 0.15,
  "rb.recEpaPerTarget": 0.2,
  "wr.recEpaPerTarget": 0.25,
  "wr.yardsPerEstRoute": 0.2,
  "wr.targetShare": 0.15,
  "wr.catchRateOverExpected": 0.15,
  "wr.yacOverExpected": 0.1,
  "wr.dropRate": 0.1,
  "wr.contestedCatchRate": 0.05,
  "te.recEpaPerTarget": 0.25,
  "te.yardsPerEstRoute": 0.2,
  "te.targetShare": 0.15,
  "te.catchRateOverExpected": 0.15,
  "te.yacOverExpected": 0.1,
  "te.dropRate": 0.1,
  "te.contestedCatchRate": 0.05,
  "ol.pressureRateAllowed": 0.3,
  "ol.sackRate": 0.15,
  "ol.protectionVsFour": 0.1,
  "ol.yardsBeforeContact": 0.2,
  "ol.stuffRate": 0.15,
  "ol.adjustedLineYards": 0.1,
  "edge.pressureRate": 0.35,
  "edge.sacks": 0.2,
  "edge.qbHits": 0.1,
  "edge.tfl": 0.15,
  "edge.runStopRate": 0.15,
  "edge.missedTacklePct": 0.05,
  "idl.pressureRate": 0.35,
  "idl.sacks": 0.2,
  "idl.qbHits": 0.1,
  "idl.tfl": 0.15,
  "idl.runStopRate": 0.15,
  "idl.missedTacklePct": 0.05,
  "lb.runStopRate": 0.25,
  "lb.tacklesPerSnap": 0.15,
  "lb.tflPlusSacks": 0.15,
  "lb.missedTacklePct": 0.15,
  "lb.coverage": 0.2,
  "lb.blitzPressureRate": 0.1,
  "cb.yardsPerCoverageSnap": 0.3,
  "cb.passerRatingAllowed": 0.2,
  "cb.completionPctAllowed": 0.15,
  "cb.ballProduction": 0.15,
  "cb.missedTacklePct": 0.1,
  "cb.tdAllowed": 0.1,
  "s.yardsPerCoverageSnap": 0.3,
  "s.passerRatingAllowed": 0.2,
  "s.completionPctAllowed": 0.15,
  "s.ballProduction": 0.15,
  "s.missedTacklePct": 0.1,
  "s.tdAllowed": 0.1,
  "k.fgPointsOverExpected": 0.7,
  "k.xpRate": 0.2,
  "k.kickoffTouchbackRate": 0.1,
  "p.netAvg": 0.5,
  "p.inside20Rate": 0.25,
  "p.puntEpa": 0.25,
  "ret.returnEpa": 0.6,
  "ret.yardsPerReturn": 0.4,
};

/** Plausible raw-value range [worst-ish, best-ish] for each metric, used to back out a value. */
const RANGES: Record<string, [number, number]> = {
  "qb.epaPerDropback": [-0.4, 0.6],
  "qb.successRate": [0.3, 0.65],
  "qb.cpoe": [-8, 10],
  "qb.sackRate": [0, 0.12],
  "qb.turnoverWorthyRate": [0, 0.08],
  "qb.badThrowPct": [8, 28],
  "qb.ngsCpoe": [-8, 10],
  "rb.rushEpaPerAtt": [-0.3, 0.3],
  "rb.successRate": [0.3, 0.6],
  "rb.ryoePerAtt": [-1.5, 2.5],
  "rb.contact": [1.5, 4.5],
  "rb.recEpaPerTarget": [-0.5, 1],
  "wr.recEpaPerTarget": [-0.5, 1.2],
  "wr.yardsPerEstRoute": [0.5, 3.5],
  "wr.targetShare": [0.05, 0.35],
  "wr.catchRateOverExpected": [-0.2, 0.2],
  "wr.yacOverExpected": [-3, 4],
  "wr.dropRate": [0, 0.25],
  "wr.contestedCatchRate": [0, 1],
  "te.recEpaPerTarget": [-0.5, 1.2],
  "te.yardsPerEstRoute": [0.5, 3.5],
  "te.targetShare": [0.05, 0.35],
  "te.catchRateOverExpected": [-0.2, 0.2],
  "te.yacOverExpected": [-3, 4],
  "te.dropRate": [0, 0.25],
  "te.contestedCatchRate": [0, 1],
  "ol.pressureRateAllowed": [0.15, 0.45],
  "ol.sackRate": [0, 0.12],
  "ol.protectionVsFour": [0, 0.15],
  "ol.yardsBeforeContact": [1, 3.5],
  "ol.stuffRate": [0.08, 0.3],
  "ol.adjustedLineYards": [2.5, 5.5],
  "edge.pressureRate": [0, 0.25],
  "edge.sacks": [0, 3],
  "edge.qbHits": [0, 4],
  "edge.tfl": [0, 3],
  "edge.runStopRate": [0, 0.15],
  "edge.missedTacklePct": [0, 30],
  "idl.pressureRate": [0, 0.25],
  "idl.sacks": [0, 3],
  "idl.qbHits": [0, 4],
  "idl.tfl": [0, 3],
  "idl.runStopRate": [0, 0.15],
  "idl.missedTacklePct": [0, 30],
  "lb.runStopRate": [0, 0.15],
  "lb.tacklesPerSnap": [0.05, 0.25],
  "lb.tflPlusSacks": [0, 3],
  "lb.missedTacklePct": [0, 30],
  "lb.coverage": [0, 100],
  "lb.blitzPressureRate": [0, 0.6],
  "cb.yardsPerCoverageSnap": [0, 2.5],
  "cb.passerRatingAllowed": [0, 158.3],
  "cb.completionPctAllowed": [30, 100],
  "cb.ballProduction": [0, 0.1],
  "cb.missedTacklePct": [0, 30],
  "cb.tdAllowed": [0, 2],
  "s.yardsPerCoverageSnap": [0, 2.5],
  "s.passerRatingAllowed": [0, 158.3],
  "s.completionPctAllowed": [30, 100],
  "s.ballProduction": [0, 0.1],
  "s.missedTacklePct": [0, 30],
  "s.tdAllowed": [0, 2],
  "k.fgPointsOverExpected": [-4, 4],
  "k.xpRate": [0.5, 1],
  "k.kickoffTouchbackRate": [0.2, 1],
  "p.netAvg": [35, 48],
  "p.inside20Rate": [0, 0.8],
  "p.puntEpa": [-2, 2],
  "ret.returnEpa": [-2, 3],
  "ret.yardsPerReturn": [5, 30],
};

function valueFor(def: MetricDef, percentile: number): number {
  const range = RANGES[def.key];
  if (!range) throw new Error(`no value range for ${def.key}`);
  const [lo, hi] = range;
  // A lower-is-better metric earns a high percentile with a low raw value.
  const t = def.direction === "higher" ? percentile / 100 : 1 - percentile / 100;
  const value = lo + (hi - lo) * t;
  if (def.unit === "count")
    return def.key.endsWith("sacks") ? Math.round(value * 2) / 2 : Math.round(value);
  return round3(value);
}

function componentsFor(pool: Pool, target: number, n: number): Component[] {
  const poolN = POOL_INFO[pool].n;
  return metricsForPool(pool).map((def) => {
    const weight = WEIGHTS[def.key];
    if (weight === undefined) throw new Error(`no weight for ${def.key}`);
    const percentile = round3(clamp(target + (rand() - 0.5) * 40, 1, 99));
    return {
      key: def.key,
      label: def.label,
      source: def.source,
      value: valueFor(def, percentile),
      unit: def.unit,
      direction: def.direction,
      weight,
      percentile,
      n,
      poolN,
    };
  });
}

/* ------------------------------------------------------------------ players */

interface Spec {
  slot: Slot;
  unit: Unit;
  label: string;
  pool: Pool;
  unitOnly?: boolean;
  players: {
    name: string;
    jersey: number | null;
    position: string;
    snaps: number;
    n: number;
    /** Raw composite percentile before shrinkage; null = not graded. */
    raw: number | null;
    reason?: string;
    penalties?: { type: string; yards: number }[];
  }[];
}

const SPECS: Spec[] = [
  {
    slot: "QB",
    unit: "offense",
    label: "Quarterback",
    pool: "QB",
    players: [{ name: "Jared Goff", jersey: 16, position: "QB", snaps: 66, n: 38, raw: 84 }],
  },
  {
    slot: "RB",
    unit: "offense",
    label: "Running back",
    pool: "RB",
    players: [
      { name: "Jahmyr Gibbs", jersey: 26, position: "RB", snaps: 44, n: 19, raw: 96 },
      { name: "David Montgomery", jersey: 5, position: "RB", snaps: 24, n: 11, raw: 68 },
    ],
  },
  {
    slot: "WR1",
    unit: "offense",
    label: "Wide receiver X",
    pool: "WR",
    players: [{ name: "Amon-Ra St. Brown", jersey: 14, position: "WR", snaps: 60, n: 11, raw: 90 }],
  },
  {
    slot: "WR2",
    unit: "offense",
    label: "Wide receiver Z",
    pool: "WR",
    players: [{ name: "Jameson Williams", jersey: 9, position: "WR", snaps: 55, n: 7, raw: 53 }],
  },
  {
    slot: "WR3",
    unit: "offense",
    label: "Slot receiver",
    pool: "WR",
    players: [
      { name: "Kalif Raymond", jersey: 11, position: "WR", snaps: 28, n: 5, raw: 28 },
      {
        name: "Isaac TeSlaa",
        jersey: 18,
        position: "WR",
        snaps: 12,
        n: 2,
        raw: null,
        reason: "below 3 targets or 15 offensive snaps",
      },
    ],
  },
  {
    slot: "TE",
    unit: "offense",
    label: "Tight end",
    pool: "TE",
    players: [
      { name: "Sam LaPorta", jersey: 87, position: "TE", snaps: 58, n: 8, raw: 74 },
      { name: "Brock Wright", jersey: 89, position: "TE", snaps: 22, n: 3, raw: 14 },
    ],
  },
  {
    slot: "LT",
    unit: "offense",
    label: "Left tackle",
    pool: "OL",
    unitOnly: true,
    players: [
      {
        name: "Taylor Decker",
        jersey: 68,
        position: "T",
        snaps: 66,
        n: 66,
        raw: null,
        penalties: [{ type: "Offensive Holding", yards: 10 }],
      },
    ],
  },
  {
    slot: "LG",
    unit: "offense",
    label: "Left guard",
    pool: "OL",
    unitOnly: true,
    players: [
      { name: "Christian Mahogany", jersey: 76, position: "G", snaps: 66, n: 66, raw: null },
    ],
  },
  {
    slot: "C",
    unit: "offense",
    label: "Center",
    pool: "OL",
    unitOnly: true,
    players: [
      {
        name: "Graham Glasgow",
        jersey: 60,
        position: "C",
        snaps: 66,
        n: 66,
        raw: null,
        penalties: [{ type: "False Start", yards: 5 }],
      },
    ],
  },
  {
    slot: "RG",
    unit: "offense",
    label: "Right guard",
    pool: "OL",
    unitOnly: true,
    players: [{ name: "Tate Ratledge", jersey: 69, position: "G", snaps: 66, n: 66, raw: null }],
  },
  {
    slot: "RT",
    unit: "offense",
    label: "Right tackle",
    pool: "OL",
    unitOnly: true,
    players: [{ name: "Penei Sewell", jersey: 58, position: "T", snaps: 66, n: 66, raw: null }],
  },
  {
    slot: "EDGE_L",
    unit: "defense",
    label: "Left edge",
    pool: "EDGE",
    players: [{ name: "Aidan Hutchinson", jersey: 97, position: "DE", snaps: 58, n: 58, raw: 98 }],
  },
  {
    slot: "IDL_L",
    unit: "defense",
    label: "Left interior",
    pool: "IDL",
    players: [{ name: "Alim McNeill", jersey: 54, position: "DT", snaps: 44, n: 44, raw: 72 }],
  },
  {
    slot: "IDL_R",
    unit: "defense",
    label: "Right interior",
    pool: "IDL",
    players: [
      { name: "DJ Reader", jersey: 98, position: "DT", snaps: 38, n: 38, raw: 56 },
      { name: "Tyleik Williams", jersey: 91, position: "DT", snaps: 26, n: 26, raw: 4 },
    ],
  },
  {
    slot: "EDGE_R",
    unit: "defense",
    label: "Right edge",
    pool: "EDGE",
    players: [
      { name: "Marcus Davenport", jersey: 92, position: "DE", snaps: 36, n: 36, raw: 46 },
      { name: "Josh Paschal", jersey: 93, position: "DE", snaps: 30, n: 30, raw: 24 },
    ],
  },
  {
    slot: "LB1",
    unit: "defense",
    label: "Linebacker (Mike)",
    pool: "LB",
    players: [{ name: "Jack Campbell", jersey: 46, position: "LB", snaps: 68, n: 68, raw: 86 }],
  },
  {
    slot: "LB2",
    unit: "defense",
    label: "Linebacker (Will)",
    pool: "LB",
    players: [
      { name: "Alex Anzalone", jersey: 34, position: "LB", snaps: 52, n: 52, raw: 42 },
      {
        name: "Derrick Barnes",
        jersey: 55,
        position: "LB",
        snaps: 16,
        n: 16,
        raw: null,
        reason: "below 20 defensive snaps",
      },
    ],
  },
  {
    slot: "CB_L",
    unit: "defense",
    label: "Left cornerback",
    pool: "CB",
    players: [{ name: "Terrion Arnold", jersey: 0, position: "CB", snaps: 66, n: 66, raw: 22 }],
  },
  {
    slot: "CB_R",
    unit: "defense",
    label: "Right cornerback",
    pool: "CB",
    players: [{ name: "D.J. Reed", jersey: 4, position: "CB", snaps: 68, n: 68, raw: 66 }],
  },
  {
    slot: "NB",
    unit: "defense",
    label: "Nickel",
    pool: "CB",
    players: [{ name: "Amik Robertson", jersey: 21, position: "CB", snaps: 50, n: 50, raw: 8 }],
  },
  {
    slot: "S1",
    unit: "defense",
    label: "Free safety",
    pool: "S",
    players: [{ name: "Kerby Joseph", jersey: 31, position: "S", snaps: 68, n: 68, raw: 95 }],
  },
  {
    slot: "S2",
    unit: "defense",
    label: "Strong safety",
    pool: "S",
    players: [{ name: "Brian Branch", jersey: 32, position: "S", snaps: 65, n: 65, raw: 79 }],
  },
  {
    slot: "K",
    unit: "st",
    label: "Kicker",
    pool: "K",
    players: [{ name: "Jake Bates", jersey: 39, position: "K", snaps: 15, n: 15, raw: 99 }],
  },
  {
    slot: "P",
    unit: "st",
    label: "Punter",
    pool: "P",
    players: [{ name: "Jack Fox", jersey: 3, position: "P", snaps: 5, n: 4, raw: 90 }],
  },
  {
    slot: "LS",
    unit: "st",
    label: "Long snapper",
    pool: "P",
    players: [
      {
        name: "Hogan Hatten",
        jersey: 48,
        position: "LS",
        snaps: 12,
        n: 0,
        raw: null,
        reason: "long snappers are not graded",
      },
    ],
  },
  {
    slot: "KR",
    unit: "st",
    label: "Kick returner",
    pool: "RET",
    players: [{ name: "Sione Vaki", jersey: 33, position: "RB", snaps: 8, n: 2, raw: 62 }],
  },
  {
    slot: "PR",
    unit: "st",
    label: "Punt returner",
    pool: "RET",
    players: [{ name: "Kalif Raymond", jersey: 11, position: "WR", snaps: 6, n: 3, raw: 84 }],
  },
];

const OL_UNIT_RAW = 92;
const olUnitGrade = round3(shrink(OL_UNIT_RAW, 32, 0));

function unitSnaps(unit: Unit): number {
  if (unit === "offense") return OFF_SNAPS;
  if (unit === "defense") return DEF_SNAPS;
  return 25;
}

let gsisCounter = 0;
const gsisIds = new Map<string, string>();
function gsisFor(name: string): string {
  const existing = gsisIds.get(name);
  if (existing) return existing;
  gsisCounter += 1;
  const id = `00-00${String(40000 + gsisCounter).padStart(5, "0")}`;
  gsisIds.set(name, id);
  return id;
}

function buildSlot(spec: Spec): SlotGrade {
  const players: PlayerGrade[] = spec.players.map((p) => {
    const { k } = POOL_INFO[spec.pool];
    const unitOnly = spec.unitOnly === true;
    let value: number | null = null;
    let raw: number | null = null;
    let components: Component[] = [];
    let reason: string | null = p.reason ?? null;
    if (unitOnly) {
      reason = "unit grade";
    } else if (p.raw !== null) {
      raw = p.raw;
      value = round3(shrink(p.raw, p.n, k));
      components = componentsFor(spec.pool, p.raw, p.n);
    }
    return {
      gsisId: gsisFor(p.name),
      name: p.name,
      jersey: p.jersey,
      position: p.position,
      pool: spec.pool,
      snaps: p.snaps,
      snapPct: round3(p.snaps / unitSnaps(spec.unit)),
      grade: {
        value,
        bin: unitOnly ? binFor(olUnitGrade) : binFor(value),
        rawComposite: raw,
        n: p.n,
        k,
        qualified: unitOnly ? false : value !== null,
        reason,
      },
      components,
      penalties: p.penalties ?? [],
    };
  });
  let tileGrade: number | null;
  if (spec.unitOnly === true) {
    tileGrade = olUnitGrade;
  } else {
    let sum = 0;
    let snaps = 0;
    for (const p of players) {
      if (p.grade.value === null) continue;
      sum += p.grade.value * p.snaps;
      snaps += p.snaps;
    }
    tileGrade = snaps === 0 ? null : round3(sum / snaps);
  }
  return {
    slot: spec.slot,
    unit: spec.unit,
    label: spec.label,
    tileGrade,
    bin: binFor(tileGrade),
    unitOnly: spec.unitOnly === true,
    players,
  };
}

const grades: GradesT = {
  season: SEASON,
  week: WEEK,
  gameId: GAME_ID,
  tier: TIER,
  slots: SPECS.map(buildSlot),
  olUnit: {
    grade: {
      value: olUnitGrade,
      bin: binFor(olUnitGrade),
      rawComposite: OL_UNIT_RAW,
      n: 32,
      k: 0,
      qualified: true,
      reason: null,
    },
    components: componentsFor("OL", OL_UNIT_RAW, OFF_SNAPS),
    gapHeat: [
      { zone: "LT", epaPerRush: 0.12, successRate: 0.5, n: 6 },
      { zone: "LG", epaPerRush: -0.1, successRate: 0.4, n: 5 },
      { zone: "C", epaPerRush: 0.25, successRate: 0.625, n: 8 },
      { zone: "RG", epaPerRush: 0.05, successRate: 0.429, n: 7 },
      { zone: "RT", epaPerRush: 0.3, successRate: 0.667, n: 6 },
    ],
  },
  pools: Object.fromEntries(
    (Object.keys(POOL_INFO) as Pool[]).map((pool) => [
      pool,
      { n: POOL_INFO[pool].n, threshold: POOL_INFO[pool].threshold },
    ]),
  ) as GradesT["pools"],
};

const binsSeen = new Set<Bin>(grades.slots.map((s) => s.bin));
console.log(`bins present: ${[...binsSeen].sort().join(", ")}`);

/* ------------------------------------------------------------------ game + team metrics */

const game: GameSummaryT = {
  season: SEASON,
  week: WEEK,
  gameId: GAME_ID,
  kickoffUtc: "2026-09-27T17:00:00Z",
  home: { team: teamConfig.team, score: 31 },
  away: { team: OPPONENT, score: 24 },
  team: { side: "home", opponent: OPPONENT, result: "W" },
  overtime: false,
  venue: { stadium: "Ford Field", roof: "dome", surface: "fieldturf", temp: null, wind: null },
  line: { spread: -6.5, total: 49.5 },
  tier: TIER,
};

const metric = (value: number, leaguePercentile: number, leagueRank: number, n: number) => ({
  value,
  leaguePercentile,
  leagueRank,
  n,
});

const teamSide: SideMetrics = {
  epaPerPlay: metric(0.184, 88, 4, 64),
  successRate: metric(0.516, 80, 7, 64),
  passEpaPerDropback: metric(0.271, 85, 5, 38),
  rushEpaPerAtt: metric(0.042, 70, 10, 26),
  explosiveRate: metric(0.141, 78, 8, 64),
  sackRate: metric(0.053, 72, 9, 38),
  thirdDownRate: metric(0.5, 81, 6, 14),
  fourthDown: { att: 2, conv: 2 },
  turnovers: 1,
  penalties: { count: 6, yards: 45 },
};

const opponentSide: SideMetrics = {
  epaPerPlay: metric(-0.021, 45, 18, 61),
  successRate: metric(0.426, 38, 20, 61),
  passEpaPerDropback: metric(0.038, 52, 16, 40),
  rushEpaPerAtt: metric(-0.118, 30, 23, 21),
  explosiveRate: metric(0.098, 41, 19, 61),
  sackRate: metric(0.075, 44, 18, 40),
  thirdDownRate: metric(0.385, 47, 17, 13),
  fourthDown: { att: 1, conv: 0 },
  turnovers: 2,
  penalties: { count: 8, yards: 71 },
};

const teamMetrics: TeamMetricsT = {
  season: SEASON,
  week: WEEK,
  gameId: GAME_ID,
  tier: TIER,
  team: teamSide,
  opponent: opponentSide,
  teamGrade: { offense: 82.4, defense: 64.1, specialTeams: 71, overall: 73.2 },
};

/* ------------------------------------------------------------------ key plays */

const keyPlays: KeyPlaysT = {
  season: SEASON,
  week: WEEK,
  gameId: GAME_ID,
  plays: [
    {
      playId: 312,
      qtr: 1,
      clock: "08:41",
      down: 2,
      ydstogo: 7,
      yardline100: 34,
      posteam: "DET",
      desc: "J.Goff pass deep right to A.St. Brown for 34 yards, TOUCHDOWN.",
      epa: 3.412,
      wpa: 0.118,
      tags: ["td", "explosive"],
    },
    {
      playId: 588,
      qtr: 1,
      clock: "02:15",
      down: 3,
      ydstogo: 8,
      yardline100: 62,
      posteam: "NYJ",
      desc: "Pass short middle intended for G.Wilson INTERCEPTED by K.Joseph at DET 41.",
      epa: -4.105,
      wpa: -0.121,
      tags: ["turnover"],
    },
    {
      playId: 901,
      qtr: 2,
      clock: "11:02",
      down: 4,
      ydstogo: 1,
      yardline100: 43,
      posteam: "DET",
      desc: "J.Gibbs right guard for 3 yards (4th and 1 conversion).",
      epa: 1.612,
      wpa: 0.061,
      tags: ["fourth-down"],
    },
    {
      playId: 1044,
      qtr: 2,
      clock: "06:37",
      down: 1,
      ydstogo: 10,
      yardline100: 12,
      posteam: "DET",
      desc: "J.Gibbs left end for 12 yards, TOUCHDOWN.",
      epa: 2.301,
      wpa: 0.071,
      tags: ["td"],
    },
    {
      playId: 1297,
      qtr: 2,
      clock: "00:48",
      down: 3,
      ydstogo: 6,
      yardline100: 27,
      posteam: "NYJ",
      desc: "Pass short left to B.Hall for 27 yards, TOUCHDOWN.",
      epa: 3.108,
      wpa: -0.104,
      tags: ["td", "explosive"],
    },
    {
      playId: 1610,
      qtr: 3,
      clock: "09:22",
      down: 2,
      ydstogo: 9,
      yardline100: 71,
      posteam: "DET",
      desc: "J.Goff sacked at DET 22 for -7 yards (Q.Williams). FUMBLES, recovered by NYJ.",
      epa: -4.87,
      wpa: -0.152,
      tags: ["sack", "turnover"],
    },
    {
      playId: 1702,
      qtr: 3,
      clock: "06:58",
      down: 1,
      ydstogo: 10,
      yardline100: 18,
      posteam: "NYJ",
      desc: "Pass deep middle to T.Conklin for 18 yards, TOUCHDOWN.",
      epa: 2.744,
      wpa: -0.119,
      tags: ["td"],
    },
    {
      playId: 1988,
      qtr: 3,
      clock: "01:30",
      down: 3,
      ydstogo: 4,
      yardline100: 56,
      posteam: "DET",
      desc: "J.Goff pass deep left to J.Williams for 56 yards, TOUCHDOWN.",
      epa: 4.219,
      wpa: 0.187,
      tags: ["td", "explosive"],
    },
    {
      playId: 2260,
      qtr: 4,
      clock: "11:44",
      down: 4,
      ydstogo: 8,
      yardline100: 32,
      posteam: "DET",
      desc: "J.Bates 50 yard field goal is GOOD.",
      epa: 1.023,
      wpa: 0.052,
      tags: ["fg", "fourth-down"],
    },
    {
      playId: 2461,
      qtr: 4,
      clock: "07:05",
      down: 4,
      ydstogo: 2,
      yardline100: 38,
      posteam: "NYJ",
      desc: "Pass short right incomplete intended for A.Lazard (A.Hutchinson pressure). Turnover on downs.",
      epa: -2.315,
      wpa: 0.121,
      tags: ["fourth-down"],
    },
    {
      playId: 2577,
      qtr: 4,
      clock: "04:12",
      down: 2,
      ydstogo: 3,
      yardline100: 9,
      posteam: "DET",
      desc: "D.Montgomery right tackle for 9 yards, TOUCHDOWN.",
      epa: 2.087,
      wpa: 0.129,
      tags: ["td"],
    },
    {
      playId: 2803,
      qtr: 4,
      clock: "01:52",
      down: 2,
      ydstogo: 10,
      yardline100: 75,
      posteam: "NYJ",
      desc: "Pass deep left intended for G.Wilson INTERCEPTED by B.Branch at DET 30. Penalty on NYJ: Offensive Holding, declined.",
      epa: -2.98,
      wpa: 0.083,
      tags: ["turnover", "penalty"],
    },
  ],
};

/* ------------------------------------------------------------------ win probability */

const WP_ANCHORS: [number, number][] = [
  [3600, 0.62],
  [3000, 0.55],
  [2400, 0.71],
  [1800, 0.58],
  [1500, 0.44],
  [1100, 0.63],
  [700, 0.81],
  [420, 0.67],
  [200, 0.91],
  [60, 0.975],
  [0, 1],
];
const SCORE_EVENTS: [number, number, number][] = [
  [2921, 7, 0],
  [2535, 7, 7],
  [2197, 14, 7],
  [1848, 14, 10],
  [1417, 14, 17],
  [1090, 21, 17],
  [704, 24, 17],
  [425, 24, 24],
  [252, 31, 24],
];

function anchorWp(seconds: number): number {
  let prev: [number, number] | undefined;
  for (const anchor of WP_ANCHORS) {
    if (prev) {
      const [s0, w0] = prev;
      const [s1, w1] = anchor;
      if (seconds <= s0 && seconds >= s1) {
        const t = s0 === s1 ? 0 : (s0 - seconds) / (s0 - s1);
        return w0 + (w1 - w0) * t;
      }
    }
    prev = anchor;
  }
  return 1;
}

const POINTS = 150;
const winProbability: WinProbabilityT = {
  season: SEASON,
  week: WEEK,
  gameId: GAME_ID,
  points: Array.from({ length: POINTS }, (_, i) => {
    const secondsRemaining = Math.round(3600 - (3600 * i) / (POINTS - 1));
    const qtr =
      secondsRemaining > 2700 ? 1 : secondsRemaining > 1800 ? 2 : secondsRemaining > 900 ? 3 : 4;
    const jitter = i === POINTS - 1 ? 0 : (rand() - 0.5) * 0.06;
    const wp = clamp(anchorWp(secondsRemaining) + jitter, 0.01, 1);
    let teamScore = 0;
    let oppScore = 0;
    for (const [at, det, opp] of SCORE_EVENTS) {
      if (secondsRemaining <= at) {
        teamScore = det;
        oppScore = opp;
      }
    }
    return {
      playId: 40 + i * 21,
      secondsRemaining,
      qtr,
      teamWp: round3(wp),
      vegasTeamWp: round3(clamp(wp + 0.04 * (1 - i / POINTS), 0.01, 1)),
      teamScore,
      oppScore,
    };
  }),
};

/* ------------------------------------------------------------------ meta, baselines, manifest */

const meta: WeekMetaT = {
  season: SEASON,
  week: WEEK,
  gameId: GAME_ID,
  tier: TIER,
  pipelineVersion: "fixture",
  gradesVersion: "fixture",
  sources: {
    pbp: "2026-09-30T05:10:00Z",
    stats_player: "2026-09-30T05:15:00Z",
    snap_counts: "2026-09-29T14:02:00Z",
    ftn_charting: "2026-09-29T20:40:00Z",
    nextgen_stats: "2026-09-30T05:20:00Z",
    pfr_advstats: "2026-10-01T16:05:00Z",
    schedules: "2026-09-30T05:00:00Z",
  },
};

const baselines: LeagueBaselinesT = {
  season: SEASON,
  week: WEEK,
  tier: TIER,
  pools: Object.fromEntries(
    (Object.keys(POOL_INFO) as Pool[]).map((pool) => [
      pool,
      Object.fromEntries(
        metricsForPool(pool).map((def) => {
          const quantiles = [10, 25, 50, 75, 90].map((p) => valueFor(def, p));
          const sorted = [...quantiles].sort((a, b) => a - b);
          return [
            def.key,
            {
              n: POOL_INFO[pool].n,
              p10: sorted[0] ?? 0,
              p25: sorted[1] ?? 0,
              p50: sorted[2] ?? 0,
              p75: sorted[3] ?? 0,
              p90: sorted[4] ?? 0,
            },
          ];
        }),
      ),
    ]),
  ) as LeagueBaselinesT["pools"],
};

const manifest: ManifestT = {
  weeks: [
    { season: SEASON, week: WEEK, gameId: GAME_ID, tier: TIER, opponent: OPPONENT, result: "W" },
  ],
};

/* ------------------------------------------------------------------ validate and write */

writeJson(join(weekDir, "game.json"), GameSummary.parse(game));
writeJson(join(weekDir, "team-metrics.json"), TeamMetrics.parse(teamMetrics));
writeJson(join(weekDir, "grades.json"), Grades.parse(grades));
writeJson(join(weekDir, "key-plays.json"), KeyPlays.parse(keyPlays));
writeJson(join(weekDir, "win-probability.json"), WinProbability.parse(winProbability));
writeJson(join(weekDir, "meta.json"), WeekMeta.parse(meta));
writeJson(join(weekDir, "league-baselines.json"), LeagueBaselines.parse(baselines));
writeJson(join(dataDir, "manifest.json"), Manifest.parse(manifest));
