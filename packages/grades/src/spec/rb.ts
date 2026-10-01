import type { PoolSpec } from "./types.js";

/**
 * The pipeline sets `n` to carries when the back has 6 or more, otherwise to touches when those
 * reach 8, otherwise to carries; so `n >= 6` is exactly "6 carries or 8 touches".
 */
export const RB: PoolSpec = {
  pool: "RB",
  label: "Running back",
  threshold: { n: 6, description: "6 carries or 8 touches" },
  k: 8,
  components: [
    { key: "rb.rushEpaPerAtt", weight: 0.3 },
    { key: "rb.successRate", weight: 0.2 },
    { key: "rb.ryoePerAtt", weight: 0.15 },
    { key: "rb.contact", weight: 0.15 },
    { key: "rb.recEpaPerTarget", weight: 0.2 },
  ],
};
