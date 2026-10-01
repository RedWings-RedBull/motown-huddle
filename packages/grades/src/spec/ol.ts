import type { PoolSpec } from "./types.js";

/**
 * The offensive line is graded as a unit against the other 31 units. Every unit qualifies and
 * `k: 0` disables shrinkage; per-lineman tiles carry the unit grade, never a fabricated
 * individual blocking grade.
 */
export const OL: PoolSpec = {
  pool: "OL",
  label: "Offensive line",
  threshold: { n: 0, description: "all 32 units" },
  k: 0,
  components: [
    { key: "ol.pressureRateAllowed", weight: 0.3 },
    { key: "ol.sackRate", weight: 0.15 },
    { key: "ol.protectionVsFour", weight: 0.1 },
    { key: "ol.yardsBeforeContact", weight: 0.2 },
    { key: "ol.stuffRate", weight: 0.15 },
    { key: "ol.adjustedLineYards", weight: 0.1 },
  ],
};
