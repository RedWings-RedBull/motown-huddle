import { metricDef, metricsForPool, Pool } from "@huddle/shared";
import { describe, expect, it } from "vitest";

import { assertSpecs, type PoolSpec, qualifies, specFor, SPECS } from "../src/index.js";

describe("SPECS", () => {
  it("has exactly one spec per pool, in field order", () => {
    expect(SPECS.map((s) => s.pool)).toEqual([...Pool.options]);
  });

  it.each(SPECS.map((s) => [s.pool, s] as const))("%s weights sum to 1", (_pool, spec) => {
    const sum = spec.components.reduce((acc, c) => acc + c.weight, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    for (const c of spec.components) expect(c.weight).toBeGreaterThan(0);
  });

  it.each(SPECS.map((s) => [s.pool, s] as const))(
    "%s uses every metric defined for the pool and nothing else",
    (pool, spec) => {
      const keys = spec.components.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect([...keys].sort()).toEqual(
        metricsForPool(pool)
          .map((d) => d.key)
          .sort(),
      );
      for (const key of keys) expect(metricDef(key)?.pool).toBe(pool);
    },
  );

  it("carries the plan's thresholds and shrinkage priors", () => {
    const byPool = Object.fromEntries(SPECS.map((s) => [s.pool, [s.threshold.n, s.k]]));
    expect(byPool).toEqual({
      QB: [14, 15],
      RB: [6, 8],
      WR: [3, 5],
      TE: [3, 5],
      OL: [0, 0],
      EDGE: [15, 25],
      IDL: [15, 25],
      LB: [20, 25],
      CB: [20, 25],
      S: [20, 25],
      K: [1, 3],
      P: [1, 3],
      RET: [2, 3],
    });
    expect(specFor("QB").threshold.description).toBe("14 dropbacks");
    // Receivers have a second way in (15 offensive snaps); nobody else does.
    expect(specFor("WR").threshold).toEqual({
      n: 3,
      altSnaps: 15,
      description: "3 targets or 15 offensive snaps",
    });
    expect(specFor("TE").threshold.altSnaps).toBe(15);
    expect(SPECS.filter((s) => s.threshold.altSnaps !== undefined).map((s) => s.pool)).toEqual([
      "WR",
      "TE",
    ]);
    expect(qualifies(specFor("WR"), 2, 15)).toBe(true);
    expect(qualifies(specFor("WR"), 2, 14)).toBe(false);
    expect(qualifies(specFor("WR"), 3, 0)).toBe(true);
    expect(qualifies(specFor("RB"), 5, 60)).toBe(false);
    expect(SPECS.every((s) => s.label.length > 0)).toBe(true);
  });

  it("specFor rejects values outside the Pool enum", () => {
    expect(() => specFor("XX" as Pool)).toThrow(/no spec for pool XX/);
  });
});

describe("assertSpecs", () => {
  const withQb = (patch: Partial<PoolSpec>): PoolSpec[] =>
    SPECS.map((s) => (s.pool === "QB" ? { ...s, ...patch } : s));

  it("accepts the shipped specs", () => {
    expect(() => {
      assertSpecs(SPECS);
    }).not.toThrow();
  });

  it("rejects weights that do not sum to 1", () => {
    const qb = specFor("QB");
    const components = qb.components.map((c, i) => (i === 0 ? { ...c, weight: 0.5 } : c));
    expect(() => {
      assertSpecs(withQb({ components }));
    }).toThrow(/QB: weights sum to/);
  });

  it("rejects unknown metrics, metrics from another pool and duplicate keys", () => {
    expect(() => {
      assertSpecs(withQb({ components: [{ key: "qb.nope", weight: 1 }] }));
    }).toThrow(/unknown metric qb.nope/);
    expect(() => {
      assertSpecs(withQb({ components: [{ key: "rb.successRate", weight: 1 }] }));
    }).toThrow(/belongs to pool RB/);
    expect(() => {
      assertSpecs(
        withQb({
          components: [
            { key: "qb.cpoe", weight: 0.5 },
            { key: "qb.cpoe", weight: 0.5 },
          ],
        }),
      );
    }).toThrow(/duplicate component qb.cpoe/);
  });

  it("rejects non-positive weights and empty component lists", () => {
    expect(() => {
      assertSpecs(
        withQb({
          components: [
            { key: "qb.cpoe", weight: 1 },
            { key: "qb.sackRate", weight: 0 },
          ],
        }),
      );
    }).toThrow(/non-positive weight/);
    expect(() => {
      assertSpecs(withQb({ components: [] }));
    }).toThrow(/QB: no components/);
  });

  it("rejects a missing or duplicated pool", () => {
    expect(() => {
      assertSpecs(SPECS.filter((s) => s.pool !== "P"));
    }).toThrow(/missing spec for pool P/);
    expect(() => {
      assertSpecs([...SPECS, specFor("K")]);
    }).toThrow(/duplicate spec for pool K/);
  });
});
