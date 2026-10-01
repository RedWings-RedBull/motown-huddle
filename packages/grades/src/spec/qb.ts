import type { PoolSpec } from "./types.js";

export const QB: PoolSpec = {
  pool: "QB",
  label: "Quarterback",
  threshold: { n: 14, description: "14 dropbacks" },
  k: 15,
  components: [
    { key: "qb.epaPerDropback", weight: 0.35 },
    { key: "qb.successRate", weight: 0.15 },
    { key: "qb.cpoe", weight: 0.15 },
    { key: "qb.sackRate", weight: 0.1 },
    { key: "qb.turnoverWorthyRate", weight: 0.1 },
    { key: "qb.badThrowPct", weight: 0.1 },
    { key: "qb.ngsCpoe", weight: 0.05 },
  ],
};
