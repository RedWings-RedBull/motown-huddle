import { describe, expect, it } from "vitest";

import {
  binFor,
  BINS,
  percentileRank,
  shrink,
  snapWeightedMean,
  weightedComposite,
} from "../src/index.js";

describe("percentileRank", () => {
  const pool = [10, 20, 30, 40, 50];

  it("ranks the median at 50 with mid-rank tie averaging", () => {
    expect(percentileRank(pool, 30)).toBe(50);
  });

  it("puts the maximum at 90 and the minimum at 10 for a pool of five", () => {
    expect(percentileRank(pool, 50)).toBe(90);
    expect(percentileRank(pool, 10)).toBe(10);
  });

  it("averages ties", () => {
    expect(percentileRank([1, 2, 2, 2, 3], 2)).toBe(50);
  });

  it("inverts for lower-is-better metrics", () => {
    expect(percentileRank(pool, 10, "lower")).toBe(90);
  });

  it("returns null for an empty pool or a non-finite value", () => {
    expect(percentileRank([], 5)).toBeNull();
    expect(percentileRank(pool, Number.NaN)).toBeNull();
  });
});

describe("weightedComposite", () => {
  it("renormalises weights over the components that are present", () => {
    expect(
      weightedComposite([
        { percentile: 80, weight: 0.5 },
        { percentile: null, weight: 0.3 },
        { percentile: 40, weight: 0.2 },
      ]),
    ).toBeCloseTo((80 * 0.5 + 40 * 0.2) / 0.7);
  });

  it("returns null when nothing is present", () => {
    expect(weightedComposite([{ percentile: null, weight: 1 }])).toBeNull();
    expect(weightedComposite([])).toBeNull();
  });
});

describe("shrink", () => {
  it("returns 50 with no sample and approaches raw as n grows", () => {
    expect(shrink(90, 0, 15)).toBe(50);
    expect(shrink(90, 15, 15)).toBe(70);
    expect(shrink(90, 1500, 15)).toBeGreaterThan(89);
  });

  it("is monotonic in n", () => {
    let prev = shrink(90, 0, 15);
    for (let n = 1; n <= 200; n += 1) {
      const next = shrink(90, n, 15);
      expect(next).toBeGreaterThanOrEqual(prev);
      prev = next;
    }
  });
});

describe("binFor", () => {
  it("maps the seven bins and na", () => {
    expect(binFor(95)).toBe("fire");
    expect(binFor(75)).toBe("hot");
    expect(binFor(60)).toBe("warm");
    expect(binFor(50)).toBe("neutral");
    expect(binFor(30)).toBe("cool");
    expect(binFor(10)).toBe("cold");
    expect(binFor(9.4)).toBe("ice");
    expect(binFor(-3)).toBe("ice");
    expect(binFor(null)).toBe("na");
    expect(binFor(Number.NaN)).toBe("na");
  });

  it("bins the rounded grade the UI displays, so a tile never contradicts the legend", () => {
    expect(binFor(59.6)).toBe("warm");
    expect(binFor(59.4)).toBe("neutral");
    expect(binFor(9.5)).toBe("cold");
    expect(binFor(89.5)).toBe("fire");
    expect(binFor(74.49)).toBe("warm");
  });

  it("publishes contiguous bin ranges from 0 to 100 that agree with binFor", () => {
    expect(BINS.map((b) => b.bin)).toEqual([
      "fire",
      "hot",
      "warm",
      "neutral",
      "cool",
      "cold",
      "ice",
    ]);
    expect(BINS[0]?.max).toBe(100);
    expect(BINS.at(-1)?.min).toBe(0);
    for (let i = 1; i < BINS.length; i += 1) {
      expect(BINS[i]?.max).toBe((BINS[i - 1]?.min ?? 0) - 1);
    }
    for (const b of BINS) {
      expect(binFor(b.min)).toBe(b.bin);
      expect(binFor(b.max)).toBe(b.bin);
      expect(b.label.length).toBeGreaterThan(0);
    }
  });
});

describe("snapWeightedMean", () => {
  it("weights by snaps and ignores ungraded players", () => {
    expect(
      snapWeightedMean([
        { grade: 80, snaps: 60 },
        { grade: 40, snaps: 20 },
        { grade: null, snaps: 10 },
      ]),
    ).toBe(70);
  });

  it("returns null when no player is graded", () => {
    expect(snapWeightedMean([{ grade: null, snaps: 5 }])).toBeNull();
  });
});
