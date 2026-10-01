import table from "./fg-make.json" with { type: "json" };

const BUCKET_SIZE = 5;

interface FgBucket {
  from: number;
  to: number;
  att: number;
  made: number;
  /** Laplace-smoothed make probability. */
  p: number;
}

export interface FgMakeTable {
  version: number;
  fittedOn: string;
  smoothing: string;
  bucketSize: number;
  buckets: FgBucket[];
}

/** Lower edge of the 5-yard bucket containing a kick distance (18 -> 15, 47 -> 45). */
export function bucketFor(distance: number): number {
  return Math.floor(distance / BUCKET_SIZE) * BUCKET_SIZE;
}

const FG_TABLE: FgMakeTable = table;

/**
 * Make probability for a kick distance from the shipped table. Distances beyond the fitted range
 * clamp to the nearest bucket, so a 70-yarder uses the longest fitted bucket.
 */
export function fgMakeProbability(distance: number, fitted: FgMakeTable = FG_TABLE): number {
  const buckets = fitted.buckets;
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  if (!first || !last) throw new Error("fg make table is empty");
  const bucket = bucketFor(distance);
  if (bucket <= first.from) return first.p;
  if (bucket >= last.from) return last.p;
  const hit = buckets.find((b) => b.from === bucket);
  if (hit) return hit.p;
  // Gap inside the range (no attempts in that bin): use the nearest lower bucket.
  let nearest = first;
  for (const b of buckets) if (b.from < bucket) nearest = b;
  return nearest.p;
}
