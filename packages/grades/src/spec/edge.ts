import type { PoolSpec } from "./types.js";

export const EDGE: PoolSpec = {
  pool: "EDGE",
  label: "Edge rusher",
  threshold: { n: 15, description: "15 defensive snaps" },
  k: 25,
  components: [
    { key: "edge.pressureRate", weight: 0.35 },
    { key: "edge.sacks", weight: 0.2 },
    { key: "edge.qbHits", weight: 0.1 },
    { key: "edge.tfl", weight: 0.15 },
    { key: "edge.runStopRate", weight: 0.15 },
    { key: "edge.missedTacklePct", weight: 0.05 },
  ],
};
