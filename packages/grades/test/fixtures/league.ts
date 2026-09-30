import {
  type GradeRequest,
  metricsForPool,
  type MetricSamples,
  type MetricValues,
  type PlayerRow,
  type Pool,
  type SlotAssignment,
  type Tier,
  type UnitRow,
} from "@huddle/shared";

import { specFor } from "../../src/index.js";

export const TEAM = "DET";

export const TEAMS = [
  "ARI",
  "ATL",
  "BAL",
  "BUF",
  "CAR",
  "CHI",
  "CIN",
  "CLE",
  "DAL",
  "DEN",
  "DET",
  "GB",
  "HOU",
  "IND",
  "JAX",
  "KC",
  "LA",
  "LAC",
  "LV",
  "MIA",
  "MIN",
  "NE",
  "NO",
  "NYG",
  "NYJ",
  "PHI",
  "PIT",
  "SEA",
  "SF",
  "TB",
  "TEN",
  "WAS",
] as const;

/** Players per team for each per-player pool (OL is five linemen with no metric values). */
const PER_POOL: Readonly<Record<Exclude<Pool, "OL">, number>> = {
  QB: 1,
  RB: 2,
  WR: 3,
  TE: 1,
  EDGE: 2,
  IDL: 2,
  LB: 2,
  CB: 3,
  S: 2,
  K: 1,
  P: 1,
  RET: 1,
};

const OL_POSITIONS = ["LT", "LG", "C", "RG", "RT"] as const;

/** mulberry32: a tiny seeded PRNG so the fixture is identical on every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function playerId(team: string, pool: Pool, i: number): string {
  return `${team}-${pool}-${i}`;
}

function metricValues(pool: Pool, next: () => number): MetricValues {
  const values: MetricValues = {};
  for (const def of metricsForPool(pool)) {
    const r = next();
    values[def.key] = def.unit === "count" ? Math.floor(r * 5) : Math.round(r * 1000) / 1000;
  }
  return values;
}

function player(team: string, pool: Exclude<Pool, "OL">, i: number, next: () => number): PlayerRow {
  const spec = specFor(pool);
  const n = spec.threshold.n + 10 + Math.floor(next() * 30);
  const samples: MetricSamples = {};
  for (const def of metricsForPool(pool)) {
    samples[def.key] = def.key === "lb.coverage" ? Math.floor(next() * 6) : n;
  }
  return {
    gsisId: playerId(team, pool, i),
    name: `${pool} ${i} ${team}`,
    jersey: 10 + i,
    position: pool,
    pool,
    team,
    snaps: n + 5,
    snapPct: Math.round((0.4 + next() * 0.6) * 100) / 100,
    n,
    values: metricValues(pool, next),
    samples,
    penalties: [],
  };
}

function lineman(team: string, i: number): PlayerRow {
  const position = OL_POSITIONS[i] ?? "OL";
  return {
    gsisId: playerId(team, "OL", i),
    name: `${position} ${team}`,
    jersey: 60 + i,
    position,
    pool: "OL",
    team,
    snaps: 60,
    snapPct: 1,
    n: 60,
    values: {},
    samples: {},
    penalties: i === 0 ? [{ type: "Offensive Holding", yards: 10 }] : [],
  };
}

function unit(team: string, next: () => number): UnitRow {
  return { team, n: 60, values: metricValues("OL", next), samples: {} };
}

const assign = (
  slot: SlotAssignment["slot"],
  unitName: SlotAssignment["unit"],
  gsisId: string,
  snaps: number,
  snapPct: number,
): SlotAssignment => ({ slot, unit: unitName, gsisId, snaps, snapPct });

/** The configured team's field: every slot but LS filled, RB stacked (listed low-snaps first). */
function assignments(): SlotAssignment[] {
  const id = (pool: Pool, i: number) => playerId(TEAM, pool, i);
  return [
    assign("QB", "offense", id("QB", 0), 60, 1),
    assign("RB", "offense", id("RB", 1), 20, 0.33),
    assign("RB", "offense", id("RB", 0), 40, 0.67),
    assign("WR1", "offense", id("WR", 0), 55, 0.92),
    assign("WR2", "offense", id("WR", 1), 50, 0.83),
    assign("WR3", "offense", id("WR", 2), 45, 0.75),
    assign("TE", "offense", id("TE", 0), 48, 0.8),
    assign("LT", "offense", id("OL", 0), 60, 1),
    assign("LG", "offense", id("OL", 1), 60, 1),
    assign("C", "offense", id("OL", 2), 60, 1),
    assign("RG", "offense", id("OL", 3), 60, 1),
    assign("RT", "offense", id("OL", 4), 60, 1),
    assign("EDGE_L", "defense", id("EDGE", 0), 50, 0.8),
    assign("EDGE_R", "defense", id("EDGE", 1), 45, 0.72),
    assign("IDL_L", "defense", id("IDL", 0), 40, 0.64),
    assign("IDL_R", "defense", id("IDL", 1), 38, 0.61),
    assign("LB1", "defense", id("LB", 0), 60, 0.96),
    assign("LB2", "defense", id("LB", 1), 35, 0.56),
    assign("CB_L", "defense", id("CB", 0), 62, 0.99),
    assign("CB_R", "defense", id("CB", 1), 60, 0.96),
    assign("NB", "defense", id("CB", 2), 40, 0.64),
    assign("S1", "defense", id("S", 0), 62, 0.99),
    assign("S2", "defense", id("S", 1), 58, 0.93),
    assign("K", "st", id("K", 0), 8, 0.3),
    assign("P", "st", id("P", 0), 5, 0.2),
    assign("KR", "st", id("RET", 0), 3, 0.12),
    assign("PR", "st", id("RET", 0), 2, 0.08),
  ];
}

/** A full 32-team synthetic week. Build a fresh one per test; mutate freely. */
export function buildLeague(tier: Tier = "final"): GradeRequest {
  const next = rng(2026_03);
  const players: PlayerRow[] = [];
  const units: UnitRow[] = [];
  for (const team of TEAMS) {
    for (const pool of Object.keys(PER_POOL) as (keyof typeof PER_POOL)[]) {
      for (let i = 0; i < PER_POOL[pool]; i += 1) players.push(player(team, pool, i, next));
    }
    for (let i = 0; i < OL_POSITIONS.length; i += 1) players.push(lineman(team, i));
    units.push(unit(team, next));
  }
  return {
    season: 2026,
    week: 3,
    gameId: "2026_03_NYJ_DET",
    team: TEAM,
    tier,
    players,
    units,
    assignments: assignments(),
    gapHeat: OL_POSITIONS.map((zone, i) => ({
      zone,
      epaPerRush: Math.round((i - 2) * 0.05 * 1000) / 1000,
      successRate: 0.4 + i * 0.02,
      n: 4 + i,
    })),
  };
}

export function findPlayer(request: GradeRequest, gsisId: string): PlayerRow {
  const row = request.players.find((p) => p.gsisId === gsisId);
  if (!row) throw new Error(`fixture has no player ${gsisId}`);
  return row;
}
