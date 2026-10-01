import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { GamesRow, PbpRow } from "../columns.js";
import { readCsv } from "../csv.js";
import { type DownloadOptions, fetchAsset } from "../download.js";
import { type Logger, silentLogger } from "../log.js";
import { stableJson } from "../stages/write.js";
import { buildCoach } from "./build.js";
import { currentCoach } from "./era.js";

export interface CoachRunOptions extends DownloadOptions {
  season: number;
  team?: string;
  dataDir: string;
  /** Earliest season of play-by-play to load; defaults to the coach's first season, at most five back. */
  from?: number;
  now?: Date;
  log?: Logger;
}

/** Only the play types the coach stage needs, so five seasons of play-by-play stay small in memory. */
const KEEP_TYPES = new Set(["pass", "run", "punt", "field_goal"]);

export async function runCoach(options: CoachRunOptions): Promise<{ coach: string; path: string }> {
  const log = options.log ?? silentLogger;
  const team = options.team ?? "DET";
  const { season } = options;
  const now = options.now ?? new Date();

  const gamesAsset = await fetchAsset("games", season, { ...options, log });
  const games = await readCsv(gamesAsset.path, { schema: GamesRow, label: gamesAsset.file });
  const coach = currentCoach(games, team, now);
  if (coach === null) throw new Error(`No completed ${team} game found to identify the head coach`);
  const coached = games.filter(
    (g) =>
      (g.home_team === team && g.home_coach === coach) ||
      (g.away_team === team && g.away_coach === coach),
  );
  const firstSeason = Math.min(season, ...coached.map((g) => g.season));
  const from = options.from ?? Math.max(firstSeason, season - 5);

  const pbp: PbpRow[] = [];
  for (let s = from; s <= season; s += 1) {
    const asset = await fetchAsset("pbp", s, { ...options, log });
    const rows = await readCsv(asset.path, {
      schema: PbpRow,
      keep: (row) =>
        row.season_type === "REG" &&
        KEEP_TYPES.has(row.play_type ?? "") &&
        (row.down === "4" ||
          row.down === "1" ||
          row.play_type === "punt" ||
          row.play_type === "field_goal"),
      label: asset.file,
    });
    log.info(`coach: ${s} ${rows.length} plays`);
    pbp.push(...rows);
  }

  const file = buildCoach({ games, pbp, team, season, now });
  const dir = join(options.dataDir, "coach");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "current.json");
  await writeFile(path, stableJson(file));
  log.info(
    `coach: ${file.coach}, ${file.log.length} decisions this season, tables from ${from}-${season} -> ${path}`,
  );
  return { coach: file.coach, path };
}
