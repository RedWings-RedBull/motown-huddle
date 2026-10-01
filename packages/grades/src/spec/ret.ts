import type { PoolSpec } from "./types.js";

export const RET: PoolSpec = {
  pool: "RET",
  label: "Returner",
  threshold: { n: 2, description: "2 returns" },
  k: 3,
  components: [
    { key: "ret.returnEpa", weight: 0.6 },
    { key: "ret.yardsPerReturn", weight: 0.4 },
  ],
};
