export {
  binFor,
  BINS,
  percentileRank,
  shrink,
  snapWeightedMean,
  weightedComposite,
} from "./core.js";
export type { BinRange, WeightedPercentile } from "./core.js";
export { gradeWeek, unitForPool } from "./engine.js";
export type { GradeWeekResult } from "./engine.js";
export { SLOT_META } from "./slots.js";
export type { SlotMeta } from "./slots.js";
export { assertSpecs, qualifies, specFor, SPECS } from "./spec/index.js";
export type { ComponentSpec, PoolSpec } from "./spec/index.js";

/** Bump when weights, thresholds, shrinkage or binning change; written to meta.json by the pipeline. */
export const GRADES_VERSION = "1.1.0";
