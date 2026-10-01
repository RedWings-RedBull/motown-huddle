import type { Bin } from "@huddle/shared";

/**
 * Mid-rank percentile of `value` within `pool`, 0-100, with tie averaging.
 * `direction: "lower"` inverts so that lower raw values score higher.
 * Returns null for an empty pool or a non-finite value.
 */
export function percentileRank(
  pool: readonly number[],
  value: number,
  direction: "higher" | "lower" = "higher",
): number | null {
  if (pool.length === 0 || !Number.isFinite(value)) return null;
  let below = 0;
  let equal = 0;
  for (const v of pool) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
  }
  const midRank = below + equal / 2;
  const pct = (midRank / pool.length) * 100;
  return direction === "lower" ? 100 - pct : pct;
}

export interface WeightedPercentile {
  percentile: number | null;
  weight: number;
}

/**
 * Weighted mean of the non-null percentiles with the weights renormalised over the
 * components that are present. Null when nothing is present.
 */
export function weightedComposite(components: readonly WeightedPercentile[]): number | null {
  let sum = 0;
  let weightSum = 0;
  for (const c of components) {
    if (c.percentile === null || c.weight <= 0) continue;
    sum += c.percentile * c.weight;
    weightSum += c.weight;
  }
  if (weightSum === 0) return null;
  return sum / weightSum;
}

/**
 * Sample-size shrinkage toward 50: grade = 50 + (raw - 50) * n / (n + k).
 * n is the player's sample (dropbacks, carries, targets, snaps); k is the pool's prior weight.
 */
export function shrink(raw: number, n: number, k: number): number {
  if (n <= 0) return 50;
  return 50 + (raw - 50) * (n / (n + k));
}

/** One colour bin of the seven-bin diverging scale, with the displayed (rounded) grade range. */
export interface BinRange {
  readonly bin: Exclude<Bin, "na">;
  readonly label: string;
  readonly min: number;
  readonly max: number;
}

/**
 * The seven bins from best to worst. Ranges are on the rounded grade the UI shows, so a tile
 * reading "60" is always Warm; the legend and the methodology page render from this table.
 */
export const BINS: readonly BinRange[] = [
  { bin: "fire", label: "On fire", min: 90, max: 100 },
  { bin: "hot", label: "Hot", min: 75, max: 89 },
  { bin: "warm", label: "Warm", min: 60, max: 74 },
  { bin: "neutral", label: "Neutral", min: 40, max: 59 },
  { bin: "cool", label: "Cool", min: 25, max: 39 },
  { bin: "cold", label: "Cold", min: 10, max: 24 },
  { bin: "ice", label: "Ice", min: 0, max: 9 },
];

/** Seven-bin diverging scale used for tile colours, binned on the rounded grade that is displayed. */
export function binFor(grade: number | null): Bin {
  if (grade === null || !Number.isFinite(grade)) return "na";
  const shown = Math.round(grade);
  for (const b of BINS) if (shown >= b.min) return b.bin;
  return "ice";
}

/** Snap-weighted mean of the non-null grades in a slot; null when no player is graded. */
export function snapWeightedMean(
  players: readonly { grade: number | null; snaps: number }[],
): number | null {
  let sum = 0;
  let snaps = 0;
  for (const p of players) {
    if (p.grade === null || p.snaps <= 0) continue;
    sum += p.grade * p.snaps;
    snaps += p.snaps;
  }
  return snaps === 0 ? null : sum / snaps;
}
