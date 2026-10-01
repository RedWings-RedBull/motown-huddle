import type { PoolSpec } from "./types.js";

export const TE: PoolSpec = {
  pool: "TE",
  label: "Tight end",
  threshold: { n: 3, altSnaps: 15, description: "3 targets or 15 offensive snaps" },
  k: 5,
  components: [
    { key: "te.recEpaPerTarget", weight: 0.25 },
    { key: "te.yardsPerEstRoute", weight: 0.2 },
    { key: "te.targetShare", weight: 0.15 },
    { key: "te.catchRateOverExpected", weight: 0.15 },
    { key: "te.yacOverExpected", weight: 0.1 },
    { key: "te.dropRate", weight: 0.1 },
    { key: "te.contestedCatchRate", weight: 0.05 },
  ],
};
