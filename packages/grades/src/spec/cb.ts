import type { PoolSpec } from "./types.js";

/** Five of six components are PFR (final tier): provisional CB grades render as "PFR pending". */
export const CB: PoolSpec = {
  pool: "CB",
  label: "Cornerback",
  threshold: { n: 20, description: "20 defensive snaps" },
  k: 25,
  components: [
    { key: "cb.yardsPerCoverageSnap", weight: 0.3 },
    { key: "cb.passerRatingAllowed", weight: 0.2 },
    { key: "cb.completionPctAllowed", weight: 0.15 },
    { key: "cb.ballProduction", weight: 0.15 },
    { key: "cb.missedTacklePct", weight: 0.1 },
    { key: "cb.tdAllowed", weight: 0.1 },
  ],
};
