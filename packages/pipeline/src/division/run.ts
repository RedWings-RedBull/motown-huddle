import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { GamesRow, PbpRow } from "../columns.js";
import { readCsv } from "../csv.js";
import { type DownloadOptions, fetchAsset } from "../download.js";
import { type Logger, silentLogger } from "../log.js";
import { isFinal } from "../stages/resolveGame.js";
import { stableJson } from "../stages/write.js";
import { buildDivision } from "./build.js";

export interface DivisionRunOptions extends DownloadOptions {
  season: number;
  team?: string;
  dataDir: string;
  runs?: number;
  log?: Logger;
}

/** Builds apps/web/src/data/division/current.json: standings, odds, profiles, upcoming games. */
export async function runDivision(
  options: DivisionRunOptions,
): Promise<{ division: string; path: string }> {
  const log = options.log ?? silentLogger;
  const team = options.team ?? "DET";
  const { season } = options;

  const gamesAsset = await fetchAsset("games", season, { ...options, log });
  const games = await readCsv(gamesAsset.path, { schema: GamesRow, label: gamesAsset.file });
  const completed = new Set(
    games
      .filter((g) => g.season === season && g.game_type === "REG" && isFinal(g))
      .map((g) => g.week),
  );
  const pbpAsset = await fetchAsset("pbp", season, { ...options, log });
  const pbp = await readCsv(pbpAsset.path, {
    schema: PbpRow,
    keep: (row) => row.season === String(season) && completed.has(Number(row.week)),
    label: pbpAsset.file,
  });

  const file = buildDivision({
    games,
    pbp,
    team,
    season,
    ...(options.runs === undefined ? {} : { runs: options.runs }),
  });
  const dir = join(options.dataDir, "division");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "current.json");
  await writeFile(path, stableJson(file));
  log.info(
    `division: ${file.division} through week ${file.throughWeek} (${file.simulation.runs} runs) -> ${path}`,
  );
  return { division: file.division, path };
}
