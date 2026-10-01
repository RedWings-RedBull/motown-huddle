import type { PoolSpec } from "./types.js";

export const K: PoolSpec = {
  pool: "K",
  label: "Kicker",
  threshold: { n: 1, description: "1 kick" },
  k: 3,
  components: [
    { key: "k.fgPointsOverExpected", weight: 0.7 },
    { key: "k.xpRate", weight: 0.2 },
    { key: "k.kickoffTouchbackRate", weight: 0.1 },
  ],
};
