import { describe, expect, it } from "vitest";

import { METRICS, METRIC_KEYS, Pool, metricDef, metricsForPool } from "../src/index.js";

describe("metric definitions", () => {
  it("uses unique <pool>.<metric> keys", () => {
    expect(new Set(METRIC_KEYS).size).toBe(METRIC_KEYS.length);
    for (const d of METRICS) {
      expect(d.key.startsWith(`${d.pool.toLowerCase()}.`)).toBe(true);
    }
  });

  it("covers every pool", () => {
    for (const pool of Pool.options) {
      expect(metricsForPool(pool).length).toBeGreaterThan(0);
    }
  });

  it("marks PFR-sourced metrics as final-tier only", () => {
    for (const d of METRICS.filter((d) => d.source === "pfr")) {
      expect(d.tier).toBe("final");
    }
    expect(metricDef("qb.epaPerDropback")?.tier).toBe("provisional");
    expect(metricDef("nope")).toBeUndefined();
  });
});
