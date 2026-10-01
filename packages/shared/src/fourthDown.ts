/**
 * Fourth-down situation math shared by the pipeline (decision log) and the browser island
 * (Go-For-It Calculator). Everything here is pure and driven by empirical tables built from
 * play-by-play; it is not the league's proprietary model.
 */

export const DISTANCE_BUCKETS = ["1", "2", "3-5", "6-9", "10+"] as const;
export type DistanceBucket = (typeof DISTANCE_BUCKETS)[number];

/** By yards from the opponent's end zone: own territory (61+), 41-60, 21-40, red zone (1-20). */
export const FIELD_BINS = ["own", "41-60", "21-40", "red-zone"] as const;
export type FieldBin = (typeof FIELD_BINS)[number];

export const WP_BUCKETS = ["<20", "20-80", ">80"] as const;
export type WpBucket = (typeof WP_BUCKETS)[number];

export function distanceBucket(ydstogo: number): DistanceBucket {
  if (ydstogo <= 1) return "1";
  if (ydstogo === 2) return "2";
  if (ydstogo <= 5) return "3-5";
  if (ydstogo <= 9) return "6-9";
  return "10+";
}

export function fieldBin(yardline100: number): FieldBin {
  if (yardline100 >= 61) return "own";
  if (yardline100 >= 41) return "41-60";
  if (yardline100 >= 21) return "21-40";
  return "red-zone";
}

export function wpBucket(wp: number): WpBucket {
  if (wp < 0.2) return "<20";
  if (wp > 0.8) return ">80";
  return "20-80";
}

export interface RateCell {
  rate: number;
  n: number;
}

/** Lower bounds of the field-goal distance bins (yards), five yards wide; the last is open-ended. */
export const FG_BINS = [18, 23, 28, 33, 38, 43, 48, 53, 58, 63] as const;
/** Lower bounds of punt bins by yardline_100 (yards from the end zone), ten yards wide. */
export const PUNT_BINS = [30, 40, 50, 60, 70, 80, 90] as const;
/** Score differential is clamped to this range for the win-probability lookup. */
export const WP_DIFF_CLAMP = 14;
/** Quarter is split into three five-minute buckets. */
export const WP_TIME_BUCKETS = 3;

export interface CalculatorTables {
  /** Fourth-down conversion rate by distance bucket and field bin (Laplace-smoothed). */
  conversion: Record<DistanceBucket, Record<FieldBin, RateCell>>;
  /** Field-goal make rate per FG_BINS entry. */
  fieldGoal: RateCell[];
  /** Mean punt net yards per PUNT_BINS entry. */
  punt: { yards: number; n: number }[];
  /**
   * Mean pre-snap win probability on first down, indexed
   * [quarter - 1][time bucket][scoreDiff + WP_DIFF_CLAMP][ceil(yardline_100 / 10) - 1].
   * Null where fewer than the minimum number of plays were observed.
   */
  winProbability: (number | null)[][][][];
}

export interface Situation {
  /** Yards from the opponent's end zone, 1-99. */
  yardline100: number;
  ydstogo: number;
  /** 1-4; overtime is treated as the fourth quarter. */
  qtr: number;
  /** Seconds left in the quarter, 0-900. */
  secondsInQuarter: number;
  /** Offense minus defense. */
  scoreDiff: number;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export function timeBucket(secondsInQuarter: number): number {
  return clamp(Math.floor((900 - clamp(secondsInQuarter, 0, 900)) / 300), 0, WP_TIME_BUCKETS - 1);
}

export function yardBucket(yardline100: number): number {
  return clamp(Math.ceil(clamp(yardline100, 1, 99) / 10), 1, 10) - 1;
}

export function fgBinIndex(distance: number): number {
  let i = 0;
  for (let k = 0; k < FG_BINS.length; k += 1) if (distance >= (FG_BINS[k] ?? 0)) i = k;
  return i;
}

export function puntBinIndex(yardline100: number): number {
  let i = 0;
  for (let k = 0; k < PUNT_BINS.length; k += 1) if (yardline100 >= (PUNT_BINS[k] ?? 0)) i = k;
  return i;
}

/**
 * Win probability for the offense at first down. Walks outward from the exact cell to nearby score
 * differentials (averaging the two sides) so sparse corners still return a value; the last resort
 * is a crude linear prior.
 */
export function lookupWp(
  tables: CalculatorTables,
  qtr: number,
  secondsInQuarter: number,
  scoreDiff: number,
  yardline100: number,
): number {
  const q = clamp(Math.round(qtr), 1, 4) - 1;
  const t = timeBucket(secondsInQuarter);
  const y = yardBucket(yardline100);
  const d = clamp(Math.round(scoreDiff), -WP_DIFF_CLAMP, WP_DIFF_CLAMP) + WP_DIFF_CLAMP;
  const grid = tables.winProbability[q]?.[t];
  if (grid) {
    for (let step = 0; step <= WP_DIFF_CLAMP; step += 1) {
      const found: number[] = [];
      for (const dd of step === 0 ? [d] : [d - step, d + step]) {
        const v = grid[dd]?.[y];
        if (v !== null && v !== undefined) found.push(v);
      }
      if (found.length > 0) return found.reduce((x, v) => x + v, 0) / found.length;
    }
  }
  return clamp(0.5 + scoreDiff * 0.03 + (50 - yardline100) * 0.002, 0.01, 0.99);
}

export type Decision = "go" | "punt" | "fg";

export interface Evaluation {
  goWp: number;
  puntWp: number;
  /** Null when the kick would be longer than the longest table bin plus five yards. */
  fgWp: number | null;
  recommended: Decision;
  conversionRate: number;
  fgMakeRate: number | null;
  fgDistance: number;
  puntNet: number;
}

const KICKOFF_YARDLINE = 75;
const MAX_FG_DISTANCE = 68;

/** Evaluates go, punt and field-goal win probabilities for a fourth-down situation. */
export function evaluate(s: Situation, tables: CalculatorTables): Evaluation {
  const yl = clamp(Math.round(s.yardline100), 1, 99);
  const togo = clamp(Math.round(s.ydstogo), 1, 99);
  const qtr = clamp(Math.round(s.qtr), 1, 4);
  const opp = (diff: number, oppYardline: number): number =>
    1 - lookupWp(tables, qtr, s.secondsInQuarter, diff, clamp(oppYardline, 1, 99));

  const conversion = tables.conversion[distanceBucket(togo)][fieldBin(yl)].rate;
  const goalToGo = togo >= yl;
  const successWp = goalToGo
    ? opp(-(s.scoreDiff + 7), KICKOFF_YARDLINE)
    : lookupWp(tables, qtr, s.secondsInQuarter, s.scoreDiff, yl - togo);
  const failWp = opp(-s.scoreDiff, 100 - yl);
  const goWp = conversion * successWp + (1 - conversion) * failWp;

  const puntNet = tables.punt[puntBinIndex(yl)]?.yards ?? 40;
  const landing = yl - puntNet;
  const puntWp = opp(-s.scoreDiff, landing <= 0 ? 80 : 100 - landing);

  const fgDistance = yl + 17;
  let fgWp: number | null = null;
  let fgMakeRate: number | null = null;
  if (fgDistance <= MAX_FG_DISTANCE) {
    fgMakeRate = tables.fieldGoal[fgBinIndex(fgDistance)]?.rate ?? 0;
    const spot = yl + 7;
    const missWp = opp(-s.scoreDiff, spot < 20 ? 80 : 100 - spot);
    fgWp = fgMakeRate * opp(-(s.scoreDiff + 3), KICKOFF_YARDLINE) + (1 - fgMakeRate) * missWp;
  }

  const options: [Decision, number][] = [
    ["go", goWp],
    ["punt", puntWp],
  ];
  if (fgWp !== null) options.push(["fg", fgWp]);
  options.sort((a, b) => b[1] - a[1]);
  return {
    goWp,
    puntWp,
    fgWp,
    recommended: options[0]?.[0] ?? "punt",
    conversionRate: conversion,
    fgMakeRate,
    fgDistance,
    puntNet,
  };
}
