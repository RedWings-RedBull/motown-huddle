import type { Pool } from "@huddle/shared";

/**
 * One weighted sub-metric of a pool's Huddle Grade. `key` must be a MetricDef key from
 * `@huddle/shared` METRICS for the same pool; label, source, direction, tier and unit come from
 * `metricDef(key)` so the methodology page and the engine can never disagree.
 */
export interface ComponentSpec {
  readonly key: string;
  /** Fraction of the composite (weights per pool sum to 1). */
  readonly weight: number;
}

export interface PoolSpec {
  readonly pool: Pool;
  /** Human label for the pool, e.g. "Quarterback". */
  readonly label: string;
  /**
   * Qualification threshold on `PlayerRow.n` (or `UnitRow.n`). `altSnaps` is an alternative
   * route in: a player also qualifies when his unit snaps reach it (WR/TE: 15 offensive snaps),
   * while shrinkage still runs on `n`. `description` is the human phrase used in
   * `GradeValue.reason` ("below 14 dropbacks") and in `Grades.pools[pool].threshold`.
   */
  readonly threshold: {
    readonly n: number;
    readonly altSnaps?: number;
    readonly description: string;
  };
  /** Shrinkage prior weight: grade = 50 + (raw - 50) * n / (n + k). Zero disables shrinkage. */
  readonly k: number;
  readonly components: readonly ComponentSpec[];
}
