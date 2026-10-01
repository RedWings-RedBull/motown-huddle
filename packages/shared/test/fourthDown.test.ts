import { describe, expect, it } from "vitest";

import {
  type CalculatorTables,
  DISTANCE_BUCKETS,
  distanceBucket,
  evaluate,
  FG_BINS,
  fgBinIndex,
  FIELD_BINS,
  fieldBin,
  lookupWp,
  PUNT_BINS,
  puntBinIndex,
  timeBucket,
  WP_DIFF_CLAMP,
  WP_TIME_BUCKETS,
  wpBucket,
  yardBucket,
} from "../src/fourthDown.js";

/** Synthetic tables: WP rises with score margin and field position; 50% conversions; 85% kicks. */
function syntheticTables(): CalculatorTables {
  const conversion = Object.fromEntries(
    DISTANCE_BUCKETS.map((d) => [
      d,
      Object.fromEntries(FIELD_BINS.map((f) => [f, { rate: 0.5, n: 100 }])),
    ]),
  ) as CalculatorTables["conversion"];
  const winProbability = Array.from({ length: 4 }, () =>
    Array.from({ length: WP_TIME_BUCKETS }, () =>
      Array.from({ length: 2 * WP_DIFF_CLAMP + 1 }, (_, d) =>
        Array.from({ length: 10 }, (_, y) =>
          Math.min(0.99, Math.max(0.01, 0.5 + (d - WP_DIFF_CLAMP) * 0.03 + (5 - y) * 0.01)),
        ),
      ),
    ),
  );
  return {
    conversion,
    fieldGoal: FG_BINS.map((lo) => ({ rate: lo < 50 ? 0.85 : 0.6, n: 100 })),
    punt: PUNT_BINS.map(() => ({ yards: 40, n: 100 })),
    winProbability,
  };
}

describe("buckets", () => {
  it("classifies distance, field position, win probability, time and kicks", () => {
    expect(
      ["1", "2", "3-5", "6-9", "10+"].map((_, i) => distanceBucket([1, 2, 4, 7, 12][i] ?? 0)),
    ).toEqual(DISTANCE_BUCKETS);
    expect([80, 50, 30, 10].map(fieldBin)).toEqual(FIELD_BINS);
    expect([0.1, 0.5, 0.9].map(wpBucket)).toEqual(["<20", "20-80", ">80"]);
    expect([900, 600, 599, 0].map(timeBucket)).toEqual([0, 1, 1, 2]);
    expect([1, 10, 11, 99].map(yardBucket)).toEqual([0, 0, 1, 9]);
    expect(fgBinIndex(17)).toBe(0);
    expect(fgBinIndex(45)).toBe(5);
    expect(fgBinIndex(70)).toBe(FG_BINS.length - 1);
    expect(puntBinIndex(35)).toBe(0);
    expect(puntBinIndex(95)).toBe(PUNT_BINS.length - 1);
  });
});

describe("lookupWp", () => {
  it("reads the exact cell and walks to neighbours when the cell is empty", () => {
    const t = syntheticTables();
    expect(lookupWp(t, 1, 900, 0, 50)).toBeCloseTo(0.51, 9);
    expect(lookupWp(t, 4, 100, 7, 20)).toBeGreaterThan(lookupWp(t, 4, 100, -7, 20));
    const q = t.winProbability[3]?.[2];
    if (q) q[WP_DIFF_CLAMP] = new Array<number | null>(10).fill(null);
    // Tied cell removed: the ±1-point neighbours average back to the middle.
    expect(lookupWp(t, 4, 0, 0, 50)).toBeCloseTo(0.51, 9);
  });

  it("falls back to a prior when the table has nothing", () => {
    const t = syntheticTables();
    t.winProbability = [];
    expect(lookupWp(t, 2, 300, 0, 50)).toBeCloseTo(0.5, 9);
  });
});

describe("evaluate", () => {
  const t = syntheticTables();

  it("rules out punting on fourth-and-short in plus territory and kicks deep in own territory", () => {
    const short = evaluate(
      { yardline100: 35, ydstogo: 1, qtr: 2, secondsInQuarter: 600, scoreDiff: 0 },
      t,
    );
    expect(short.recommended).not.toBe("punt");
    expect(short.fgWp).not.toBeNull();
    const deep = evaluate(
      { yardline100: 90, ydstogo: 10, qtr: 1, secondsInQuarter: 600, scoreDiff: 0 },
      t,
    );
    expect(deep.recommended).toBe("punt");
    expect(deep.fgWp).toBeNull();
    expect(deep.fgDistance).toBe(107);
  });

  it("treats goal-to-go conversions as touchdowns and clamps inputs", () => {
    const g = evaluate(
      { yardline100: 1, ydstogo: 1, qtr: 4, secondsInQuarter: 120, scoreDiff: -4 },
      t,
    );
    expect(g.goWp).toBeGreaterThan(g.fgWp ?? 0);
    expect(g.conversionRate).toBe(0.5);
    const weird = evaluate(
      { yardline100: 500, ydstogo: -3, qtr: 9, secondsInQuarter: 5000, scoreDiff: 0 },
      t,
    );
    expect(weird.fgDistance).toBe(116);
    expect(weird.puntWp).toBeGreaterThan(0);
  });
});
