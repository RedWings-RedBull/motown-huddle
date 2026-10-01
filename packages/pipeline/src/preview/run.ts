import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { GamesRow, InjuryRow, PbpRow } from "../columns.js";
import { readCsv } from "../csv.js";
import { type DownloadOptions, fetchAsset } from "../download.js";
import { type Logger, silentLogger } from "../log.js";
import { isFinal } from "../stages/resolveGame.js";
import { stableJson } from "../stages/write.js";
import { buildPreview } from "./build.js";

export interface PreviewRunOptions extends DownloadOptions {
  season: number;
  team?: string;
  dataDir: string;
  now?: Date;
  log?: Logger;
}

/** Builds apps/web/src/data/preview/next.json for the team's next scheduled game. */
export async function runPreview(
  options: PreviewRunOptions,
): Promise<{ gameId: string; path: string } | { gameId: null }> {
  const log = options.log ?? silentLogger;
  const team = options.team ?? "DET";
  const { season } = options;
  const now = options.now ?? new Date();

  const gamesAsset = await fetchAsset("games", season, { ...options, log });
  const games = await readCsv(gamesAsset.path, { schema: GamesRow, label: gamesAsset.file });
  // Completed regular-season league weeks feed the season-to-date splits.
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
  const injuryAsset = await fetchAsset("injuries", season, { ...options, log });
  const injuries = await readCsv(injuryAsset.path, {
    schema: InjuryRow,
    keep: (row) => row.season === String(season),
    label: injuryAsset.file,
  });

  const preview = buildPreview({ games, pbp, injuries, team, season, now });
  if (preview === null) {
    log.warn(`preview: no upcoming ${team} game found for ${season}`);
    return { gameId: null };
  }
  const dir = join(options.dataDir, "preview");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "next.json");
  await writeFile(path, stableJson(preview));
  log.info(
    `preview: ${preview.gameId} (${preview.isHome ? "vs" : "at"} ${preview.opponent}) -> ${path}`,
  );
  return { gameId: preview.gameId, path };
}
