import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { na, str } from "../columns.js";
import { readCsv } from "../csv.js";
import { fetchAsset, type DownloadOptions } from "../download.js";
import { silentLogger, type Logger } from "../log.js";
import { bucketFor, type FgMakeTable } from "./fgTable.js";

/**
 * Fits the field-goal make table shipped as fg-make.json: every field-goal attempt from the
 * nflverse play-by-play files (2021-2025 by default), bucketed into 5-yard bins (everything
 * under 20 yards pooled with 20-24) with the Laplace-smoothed make probability
 * (made + 1) / (attempts + 2). Blocked kicks count as misses.
 * Run once and commit the JSON:
 *
 *   pnpm pipeline --fit-fg-table
 */
export const DEFAULT_FIT_SEASONS = [2021, 2022, 2023, 2024, 2025];

/** Must match the bucket width bucketFor() uses. */
const BUCKET_SIZE = 5;

/**
 * Attempts shorter than this pool into the first bucket: a dozen chip shots a season is too few
 * for their own Laplace estimate and made the table non-monotone (an 18-yard make out-scored a
 * 22-yard one).
 */
const MIN_BUCKET = 20;

const FgRow = z.object({
  field_goal_attempt: na(),
  field_goal_result: str(),
  kick_distance: na(),
});

export interface FitOptions extends DownloadOptions {
  seasons?: number[];
  /** Output path; defaults to src/models/fg-make.json next to this module. */
  out?: string;
  log?: Logger;
}

export async function fitFgTable(options: FitOptions = {}): Promise<FgMakeTable> {
  const log = options.log ?? silentLogger;
  const seasons = options.seasons ?? DEFAULT_FIT_SEASONS;
  const att = new Map<number, { att: number; made: number }>();
  for (const season of seasons) {
    const asset = await fetchAsset("pbp", season, { ...options, log });
    const rows = await readCsv(asset.path, {
      schema: FgRow,
      keep: (r) => r.field_goal_attempt === "1",
      label: asset.file,
    });
    for (const r of rows) {
      if (r.kick_distance === null || r.field_goal_result === null) continue;
      const bucket = Math.max(MIN_BUCKET, bucketFor(r.kick_distance));
      const cell = att.get(bucket) ?? { att: 0, made: 0 };
      cell.att += 1;
      if (r.field_goal_result === "made") cell.made += 1;
      att.set(bucket, cell);
    }
    log.info(`${season}: ${rows.length} field-goal attempts`);
  }
  const buckets = [...att.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([from, cell]) => ({
      from,
      to: from + BUCKET_SIZE - 1,
      att: cell.att,
      made: cell.made,
      p: Number(((cell.made + 1) / (cell.att + 2)).toFixed(4)),
    }));
  const table: FgMakeTable = {
    version: 1,
    fittedOn: `${seasons[0] ?? "?"}-${seasons[seasons.length - 1] ?? "?"} nflverse pbp field_goal_attempt rows`,
    smoothing: "laplace (made + 1) / (att + 2)",
    bucketSize: BUCKET_SIZE,
    buckets,
  };
  const out = options.out ?? join(dirname(fileURLToPath(import.meta.url)), "fg-make.json");
  await writeFile(out, `${JSON.stringify(table, null, 2)}\n`);
  log.info(`wrote ${out}`);
  return table;
}
