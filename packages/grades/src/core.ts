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

/** Seven-bin diverging scale used for tile colours. */
export function binFor(grade: number | null): Bin {
  if (grade === null || !Number.isFinite(grade)) return "na";
  if (grade >= 90) return "fire";
  if (grade >= 75) return "hot";
  if (grade >= 60) return "warm";
  if (grade >= 40) return "neutral";
  if (grade >= 25) return "cool";
  if (grade >= 10) return "cold";
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
