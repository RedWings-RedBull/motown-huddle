import type { PoolSpec } from "./types.js";

export const IDL: PoolSpec = {
  pool: "IDL",
  label: "Interior defensive line",
  threshold: { n: 15, description: "15 defensive snaps" },
  k: 25,
  components: [
    { key: "idl.pressureRate", weight: 0.35 },
    { key: "idl.sacks", weight: 0.2 },
    { key: "idl.qbHits", weight: 0.1 },
    { key: "idl.tfl", weight: 0.15 },
    { key: "idl.runStopRate", weight: 0.15 },
    { key: "idl.missedTacklePct", weight: 0.05 },
  ],
};
