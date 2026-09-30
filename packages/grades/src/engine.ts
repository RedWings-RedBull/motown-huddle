import {
  type Component,
  type GradeRequest,
  type GradeValue,
  type Grades,
  type LeagueBaselines,
  type MetricDef,
  type MetricSamples,
  type MetricValues,
  metricDef,
  type PlayerGrade,
  type PlayerRow,
  type Pool,
  Slot,
  type SlotAssignment,
  type SlotGrade,
  type Tier,
  type Unit,
} from "@huddle/shared";

import { binFor, percentileRank, shrink, snapWeightedMean, weightedComposite } from "./core.js";
import { SLOT_META } from "./slots.js";
import { type ComponentSpec, type PoolSpec, qualifies, specFor, SPECS } from "./spec/index.js";

export interface GradeWeekResult {
  grades: Grades;
  baselines: LeagueBaselines;
}

/**
 * Minimum own sample for a metric, and what happens below it: `drop` removes the component (its
 * weight is renormalised away), `neutral` keeps the value but scores it at the 50th percentile.
 * Either way the player leaves the metric's league population.
 */
interface SampleRule {
  readonly min: number;
  readonly below: "drop" | "neutral";
}

const COVERAGE_KEYS = [
  "yardsPerCoverageSnap",
  "passerRatingAllowed",
  "completionPctAllowed",
  "tdAllowed",
] as const;

const SAMPLE_RULES: ReadonlyMap<string, SampleRule> = new Map<string, SampleRule>([
  ["lb.coverage", { min: 2, below: "drop" }],
  // CB/S coverage metrics need 3 targets; an untargeted defender is neutral, not the league's best.
  ...(["cb", "s"] as const).flatMap((pool) =>
    COVERAGE_KEYS.map((key): [string, SampleRule] => [
      `${pool}.${key}`,
      { min: 3, below: "neutral" },
    ]),
  ),
]);

/** Pools whose provisional grade is only ball production: shown as a grey "pending" tile. */
const PFR_PENDING_POOLS: ReadonlySet<Pool> = new Set<Pool>(["CB", "S"]);

const POOL_UNIT: Readonly<Record<Pool, Unit>> = {
  QB: "offense",
  RB: "offense",
  WR: "offense",
  TE: "offense",
  OL: "offense",
  EDGE: "defense",
  IDL: "defense",
  LB: "defense",
  CB: "defense",
  S: "defense",
  K: "st",
  P: "st",
  RET: "st",
};

/** The unit a pool's grade describes; a tile only averages grades from its own unit. */
export function unitForPool(pool: Pool): Unit {
  return POOL_UNIT[pool];
}

/**
 * Slots whose occupants are never graded, with the reason shown on the tile. There is no LS pool,
 * so the pipeline files long snappers under P with n = 0; without this they would read
 * "below 1 punt".
 */
const UNGRADED_SLOTS: ReadonlyMap<Slot, string> = new Map([["LS", "long snappers are not graded"]]);

const QUANTILES = [0.1, 0.25, 0.5, 0.75, 0.9] as const;

interface MetricRow {
  readonly n: number;
  /** Unit snaps; only players carry them (the alternative snap threshold never applies to units). */
  readonly snaps?: number;
  readonly values: MetricValues;
  readonly samples: MetricSamples;
}

interface ActiveComponent {
  readonly spec: ComponentSpec;
  readonly def: MetricDef;
  /** Sorted non-null raw values of the qualifying population for this metric. */
  readonly population: readonly number[];
}

interface RowGrade {
  readonly grade: GradeValue;
  readonly components: Component[];
}

function requireDef(key: string): MetricDef {
  const def = metricDef(key);
  // Unreachable for SPECS (assertSpecs validates every key at module load).
  if (!def) throw new Error(`unknown metric ${key}`);
  return def;
}

/** The rule `key` falls short of for this row, or null when the sample is large enough. */
function belowMinimum(row: MetricRow, key: string): SampleRule | null {
  const rule = SAMPLE_RULES.get(key);
  if (rule === undefined || (row.samples[key] ?? 0) >= rule.min) return null;
  return rule;
}

/** Raw value of `key` for a row, or null when missing. */
function rawValue(row: MetricRow, key: string): number | null {
  return row.values[key] ?? null;
}

/** Value of `key` as it enters the league population: null when missing or below the minimum. */
function populationValue(row: MetricRow, key: string): number | null {
  return belowMinimum(row, key) === null ? rawValue(row, key) : null;
}

function isActive(def: MetricDef, tier: Tier): boolean {
  return tier === "final" || def.tier === "provisional";
}

/** Components allowed in this tier, each with its population values already collected. */
function activeComponents(
  spec: PoolSpec,
  tier: Tier,
  population: readonly MetricRow[],
): ActiveComponent[] {
  const out: ActiveComponent[] = [];
  for (const c of spec.components) {
    const def = requireDef(c.key);
    if (!isActive(def, tier)) continue;
    const values: number[] = [];
    for (const row of population) {
      const v = populationValue(row, c.key);
      if (v !== null) values.push(v);
    }
    values.sort((a, b) => a - b);
    out.push({ spec: c, def, population: values });
  }
  return out;
}

/** A component's value and percentile under the metric's sample rule. */
function score(
  row: MetricRow,
  a: ActiveComponent,
): { value: number | null; percentile: number | null } {
  const value = rawValue(row, a.spec.key);
  if (value === null) return { value: null, percentile: null };
  const rule = belowMinimum(row, a.spec.key);
  if (rule === null) {
    return { value, percentile: percentileRank(a.population, value, a.def.direction) };
  }
  return rule.below === "drop" ? { value: null, percentile: null } : { value, percentile: 50 };
}

/**
 * Why a CB/S grade is withheld for lack of PFR data: the whole tier in provisional, or a missing
 * PFR row (crosswalk miss or omission) in final, when every PFR component is empty.
 */
function pfrReason(spec: PoolSpec, tier: Tier, components: readonly Component[]): string | null {
  if (!PFR_PENDING_POOLS.has(spec.pool)) return null;
  if (tier === "provisional") return "PFR pending";
  return components.some((c) => c.source === "pfr" && c.value !== null) ? null : "PFR row missing";
}

function gradeRow(
  row: MetricRow,
  spec: PoolSpec,
  active: readonly ActiveComponent[],
  tier: Tier,
): RowGrade {
  const components: Component[] = active.map((a) => {
    const { value, percentile } = score(row, a);
    return {
      key: a.spec.key,
      label: a.def.label,
      source: a.def.source,
      value,
      unit: a.def.unit,
      direction: a.def.direction,
      weight: a.spec.weight,
      percentile,
      n: row.samples[a.spec.key] ?? row.n,
      poolN: a.population.length,
    };
  });
  const rawComposite = weightedComposite(
    components.map((c) => ({ percentile: c.percentile, weight: c.weight })),
  );
  const base = { rawComposite, n: row.n, k: spec.k };
  if (!qualifies(spec, row.n, row.snaps ?? 0)) {
    const reason = `below ${spec.threshold.description}`;
    return { grade: { ...base, value: null, bin: "na", qualified: false, reason }, components };
  }
  const pending = pfrReason(spec, tier, components);
  if (pending !== null) {
    return {
      grade: { ...base, value: null, bin: "na", qualified: true, reason: pending },
      components,
    };
  }
  if (rawComposite === null) {
    const reason = "no metric inputs";
    return { grade: { ...base, value: null, bin: "na", qualified: true, reason }, components };
  }
  const value = spec.k === 0 ? rawComposite : shrink(rawComposite, row.n, spec.k);
  return {
    grade: { ...base, value, bin: binFor(value), qualified: true, reason: null },
    components,
  };
}

/** Type-7 (linear interpolation) quantile of an ascending, non-empty sample. */
function quantile(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo];
  const b = sorted[hi];
  if (a === undefined || b === undefined) throw new Error("quantile of an empty sample");
  return a + (b - a) * (pos - lo);
}

function summarise(active: readonly ActiveComponent[]): LeagueBaselines["pools"][Pool] {
  const out: LeagueBaselines["pools"][Pool] = {};
  for (const a of active) {
    if (a.population.length === 0) continue;
    const [p10, p25, p50, p75, p90] = QUANTILES.map((q) => quantile(a.population, q)) as [
      number,
      number,
      number,
      number,
      number,
    ];
    out[a.spec.key] = { n: a.population.length, p10, p25, p50, p75, p90 };
  }
  return out;
}

/** Stable stacking order for players sharing a slot: snaps, then snap share, then id. */
function byStackOrder(a: SlotAssignment, b: SlotAssignment): number {
  return b.snaps - a.snaps || b.snapPct - a.snapPct || a.gsisId.localeCompare(b.gsisId);
}

function ungraded(n: number, k: number, qualified: boolean, reason: string): GradeValue {
  return { value: null, bin: "na", rawComposite: null, n, k, qualified, reason };
}

/** Linemen carry snaps and penalties only; the grade lives on the unit. */
function olPlayerGrade(player: PlayerRow): RowGrade {
  return { grade: ungraded(player.n, 0, false, "unit grade only"), components: [] };
}

/**
 * Grade one week for the configured team.
 *
 * Per pool the population is every league-wide row meeting the spec threshold; percentiles are
 * taken against that population, composited with renormalised weights over the components
 * present in this tier, shrunk toward 50 and binned. Only the requested team's players appear
 * in the slots; the population is used for percentiles and baselines only. Nothing is rounded
 * here (the pipeline rounds on write) and nothing depends on wall-clock time.
 */
export function gradeWeek(request: GradeRequest): GradeWeekResult {
  const { tier } = request;
  const graded = new Map<string, PlayerGrade>();
  const pools: Partial<Grades["pools"]> = {};
  const baselinePools: Partial<LeagueBaselines["pools"]> = {};

  // Offensive line: one row per team, graded against the other units, no shrinkage.
  const olSpec = specFor("OL");
  const olPopulation = request.units.filter((u) => qualifies(olSpec, u.n, 0));
  const olActive = activeComponents(olSpec, tier, olPopulation);
  const unit = request.units.find((u) => u.team === request.team);
  const olRow: RowGrade = unit
    ? gradeRow(unit, olSpec, olActive, tier)
    : { grade: ungraded(0, olSpec.k, false, "no unit data"), components: [] };
  const unitGrade: Grades["olUnit"] = { ...olRow, gapHeat: request.gapHeat.map((g) => ({ ...g })) };
  pools.OL = { n: olPopulation.length, threshold: olSpec.threshold.description };
  baselinePools.OL = summarise(olActive);

  // Every other pool: league-wide population above the threshold, per-player grades for the team.
  for (const spec of SPECS) {
    const inPool = request.players.filter((p) => p.pool === spec.pool);
    if (spec.pool === "OL") {
      for (const player of inPool) {
        if (player.team === request.team) {
          graded.set(player.gsisId, toPlayerGrade(player, olPlayerGrade(player)));
        }
      }
      continue;
    }
    const population = inPool.filter((p) => qualifies(spec, p.n, p.snaps));
    const active = activeComponents(spec, tier, population);
    for (const player of inPool) {
      if (player.team === request.team) {
        graded.set(player.gsisId, toPlayerGrade(player, gradeRow(player, spec, active, tier)));
      }
    }
    pools[spec.pool] = { n: population.length, threshold: spec.threshold.description };
    baselinePools[spec.pool] = summarise(active);
  }

  // SPECS covers every pool (asserted at module load), so both records are complete.
  const slots: SlotGrade[] = Slot.options.map((slot) => {
    const meta = SLOT_META[slot];
    const ungradedReason = UNGRADED_SLOTS.get(slot);
    const players: PlayerGrade[] = [];
    for (const a of request.assignments.filter((x) => x.slot === slot).sort(byStackOrder)) {
      const g = graded.get(a.gsisId);
      if (!g) continue;
      const placed = { ...g, snaps: a.snaps, snapPct: a.snapPct };
      players.push(
        ungradedReason === undefined
          ? placed
          : { ...placed, grade: ungraded(0, 0, false, ungradedReason), components: [] },
      );
    }
    // A tile's colour only blends grades from its own unit: a back who also fielded kickoffs is
    // listed on KR, but his rushing grade never paints the return tile.
    const own = players.filter((p) => unitForPool(p.pool) === meta.unit);
    const tileGrade =
      players.length === 0
        ? null
        : meta.unitOnly
          ? unitGrade.grade.value
          : snapWeightedMean(own.map((p) => ({ grade: p.grade.value, snaps: p.snaps })));
    return {
      slot,
      unit: meta.unit,
      label: meta.label,
      tileGrade,
      bin: binFor(tileGrade),
      unitOnly: meta.unitOnly,
      players,
    };
  });

  return {
    grades: {
      season: request.season,
      week: request.week,
      gameId: request.gameId,
      tier,
      slots,
      olUnit: unitGrade,
      pools: pools as Grades["pools"],
    },
    baselines: {
      season: request.season,
      week: request.week,
      tier,
      pools: baselinePools as LeagueBaselines["pools"],
    },
  };
}

function toPlayerGrade(player: PlayerRow, row: RowGrade): PlayerGrade {
  return {
    gsisId: player.gsisId,
    name: player.name,
    jersey: player.jersey,
    position: player.position,
    pool: player.pool,
    snaps: player.snaps,
    snapPct: player.snapPct,
    grade: row.grade,
    components: row.components,
    penalties: player.penalties.map((p) => ({ ...p })),
  };
}
