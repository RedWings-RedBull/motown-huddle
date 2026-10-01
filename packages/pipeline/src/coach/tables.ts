import type { CalculatorTables, DistanceBucket, FieldBin } from "@huddle/shared";
import {
  DISTANCE_BUCKETS,
  FG_BINS,
  FIELD_BINS,
  fgBinIndex,
  PUNT_BINS,
  puntBinIndex,
  WP_DIFF_CLAMP,
  WP_TIME_BUCKETS,
  distanceBucket,
  fieldBin,
  timeBucket,
  yardBucket,
} from "@huddle/shared";

import type { PbpRow } from "../columns.js";

const MIN_WP_CELL = 20;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Seconds left in the current quarter from the game clock. */
export function secondsInQuarter(qtr: number, gameSecondsRemaining: number): number {
  if (qtr >= 5) return clamp(gameSecondsRemaining, 0, 900);
  return clamp(gameSecondsRemaining - (4 - qtr) * 900, 0, 900);
}

/** Empirical calculator tables from regular-season play-by-play (several seasons recommended). */
export function buildTables(pbp: readonly PbpRow[]): CalculatorTables {
  const conv: Record<string, Record<string, { made: number; att: number }>> = {};
  for (const d of DISTANCE_BUCKETS) {
    conv[d] = {};
    for (const f of FIELD_BINS) conv[d][f] = { made: 0, att: 0 };
  }
  const fg = FG_BINS.map(() => ({ made: 0, att: 0 }));
  const punt = PUNT_BINS.map(() => ({ yards: 0, n: 0 }));
  const wpSum: number[][][][] = Array.from({ length: 4 }, () =>
    Array.from({ length: WP_TIME_BUCKETS }, () =>
      Array.from({ length: 2 * WP_DIFF_CLAMP + 1 }, () => new Array<number>(10).fill(0)),
    ),
  );
  const wpN: number[][][][] = wpSum.map((q) => q.map((t) => t.map((d) => d.map(() => 0))));

  for (const row of pbp) {
    if (row.yardline_100 === null || row.qtr === null) continue;
    if (
      row.down === 4 &&
      (row.play_type === "pass" || row.play_type === "run") &&
      row.ydstogo !== null
    ) {
      const cell = conv[distanceBucket(row.ydstogo)]?.[fieldBin(row.yardline_100)];
      if (cell) {
        cell.att += 1;
        if (row.fourth_down_converted === 1 || row.touchdown === 1) cell.made += 1;
      }
    }
    if (
      row.play_type === "field_goal" &&
      row.kick_distance !== null &&
      row.field_goal_result !== null
    ) {
      const cell = fg[fgBinIndex(row.kick_distance)];
      if (cell && row.field_goal_result !== "blocked") {
        cell.att += 1;
        if (row.field_goal_result === "made") cell.made += 1;
      }
    }
    if (row.play_type === "punt" && row.kick_distance !== null && row.yardline_100 >= 30) {
      const cell = punt[puntBinIndex(row.yardline_100)];
      if (cell) {
        const net = row.kick_distance - (row.return_yards ?? 0) - (row.touchback === 1 ? 20 : 0);
        cell.yards += net;
        cell.n += 1;
      }
    }
    if (row.down === 1 && row.wp !== null && row.score_differential !== null && row.qtr <= 5) {
      const q = clamp(row.qtr, 1, 4) - 1;
      const t = timeBucket(secondsInQuarter(row.qtr, row.game_seconds_remaining ?? 0));
      const d =
        clamp(Math.round(row.score_differential), -WP_DIFF_CLAMP, WP_DIFF_CLAMP) + WP_DIFF_CLAMP;
      const y = yardBucket(row.yardline_100);
      const sums = wpSum[q]?.[t]?.[d];
      const counts = wpN[q]?.[t]?.[d];
      if (sums && counts) {
        sums[y] = (sums[y] ?? 0) + row.wp;
        counts[y] = (counts[y] ?? 0) + 1;
      }
    }
  }

  const conversion = Object.fromEntries(
    DISTANCE_BUCKETS.map((d) => [
      d,
      Object.fromEntries(
        FIELD_BINS.map((f) => {
          const c = conv[d]?.[f] ?? { made: 0, att: 0 };
          return [f, { rate: (c.made + 1) / (c.att + 2), n: c.att }];
        }),
      ),
    ]),
  ) as Record<DistanceBucket, Record<FieldBin, { rate: number; n: number }>>;

  return {
    conversion,
    fieldGoal: fg.map((c) => ({ rate: (c.made + 1) / (c.att + 2), n: c.att })),
    punt: punt.map((c) => ({ yards: c.n === 0 ? 40 : c.yards / c.n, n: c.n })),
    winProbability: wpSum.map((q, qi) =>
      q.map((t, ti) =>
        t.map((d, di) =>
          d.map((sum, yi) => {
            const n = wpN[qi]?.[ti]?.[di]?.[yi] ?? 0;
            return n >= MIN_WP_CELL ? sum / n : null;
          }),
        ),
      ),
    ),
  };
}
