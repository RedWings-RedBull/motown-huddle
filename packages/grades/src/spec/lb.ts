import type { PoolSpec } from "./types.js";

/** `lb.coverage` only counts when the player was targeted at least twice (see engine MIN_SAMPLE). */
export const LB: PoolSpec = {
  pool: "LB",
  label: "Linebacker",
  threshold: { n: 20, description: "20 defensive snaps" },
  k: 25,
  components: [
    { key: "lb.runStopRate", weight: 0.25 },
    { key: "lb.tacklesPerSnap", weight: 0.15 },
    { key: "lb.tflPlusSacks", weight: 0.15 },
    { key: "lb.missedTacklePct", weight: 0.15 },
    { key: "lb.coverage", weight: 0.2 },
    { key: "lb.blitzPressureRate", weight: 0.1 },
  ],
};
