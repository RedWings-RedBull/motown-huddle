import type { PoolSpec } from "./types.js";

export const P: PoolSpec = {
  pool: "P",
  label: "Punter",
  threshold: { n: 1, description: "1 punt" },
  k: 3,
  components: [
    { key: "p.netAvg", weight: 0.4 },
    { key: "p.inside20Rate", weight: 0.3 },
    { key: "p.puntEpa", weight: 0.3 },
  ],
};
