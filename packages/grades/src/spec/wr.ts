import type { PoolSpec } from "./types.js";

export const WR: PoolSpec = {
  pool: "WR",
  label: "Wide receiver",
  threshold: { n: 3, altSnaps: 15, description: "3 targets or 15 offensive snaps" },
  k: 5,
  components: [
    { key: "wr.recEpaPerTarget", weight: 0.25 },
    { key: "wr.yardsPerEstRoute", weight: 0.2 },
    { key: "wr.targetShare", weight: 0.15 },
    { key: "wr.catchRateOverExpected", weight: 0.15 },
    { key: "wr.yacOverExpected", weight: 0.1 },
    { key: "wr.dropRate", weight: 0.1 },
    { key: "wr.contestedCatchRate", weight: 0.05 },
  ],
};
