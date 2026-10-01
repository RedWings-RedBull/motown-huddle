import type { PoolSpec } from "./types.js";

/** Five of six components are PFR (final tier): provisional S grades render as "PFR pending". */
export const S: PoolSpec = {
  pool: "S",
  label: "Safety",
  threshold: { n: 20, description: "20 defensive snaps" },
  k: 25,
  components: [
    { key: "s.yardsPerCoverageSnap", weight: 0.3 },
    { key: "s.passerRatingAllowed", weight: 0.2 },
    { key: "s.completionPctAllowed", weight: 0.15 },
    { key: "s.ballProduction", weight: 0.15 },
    { key: "s.missedTacklePct", weight: 0.1 },
    { key: "s.tdAllowed", weight: 0.1 },
  ],
};
