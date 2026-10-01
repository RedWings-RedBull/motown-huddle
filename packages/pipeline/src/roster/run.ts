import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { InjuryRow, PlayersRow, WeeklyRosterRow } from "../columns.js";
import { readCsv } from "../csv.js";
import { type DownloadOptions, fetchAsset } from "../download.js";
import { type Logger, silentLogger } from "../log.js";
import { stableJson } from "../stages/write.js";
import { buildRoster, type PlayerInfo } from "./build.js";

export interface RosterRunOptions extends DownloadOptions {
  season: number;
  team?: string;
  /** apps/web/src/data by default. */
  dataDir: string;
  log?: Logger;
}

/** Downloads the weekly roster and injury files, builds the roster artifact and writes it. */
export async function runRoster(
  options: RosterRunOptions,
): Promise<{ week: number; players: number; path: string }> {
  const log = options.log ?? silentLogger;
  const team = options.team ?? "DET";
  const { season } = options;
  const forTeam = (row: Record<string, string>) =>
    row.team === team && row.season === String(season);

  const rosterAsset = await fetchAsset("weeklyRosters", season, { ...options, log });
  const rows = await readCsv(rosterAsset.path, {
    schema: WeeklyRosterRow,
    keep: forTeam,
    label: rosterAsset.file,
  });
  const injuryAsset = await fetchAsset("injuries", season, { ...options, log });
  const injuries = await readCsv(injuryAsset.path, {
    schema: InjuryRow,
    keep: forTeam,
    label: injuryAsset.file,
  });

  const playersAsset = await fetchAsset("players", season, { ...options, log });
  const players = await readCsv(playersAsset.path, {
    schema: PlayersRow,
    keep: (row) => row.latest_team === team,
    label: playersAsset.file,
  });
  const info = new Map<string, PlayerInfo>();
  for (const p of players) {
    if (p.gsis_id) info.set(p.gsis_id, { position: p.position, ngsPosition: p.ngs_position });
  }

  const roster = buildRoster(rows, injuries, team, season, info);
  const dir = join(options.dataDir, "roster");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "current.json");
  await writeFile(path, stableJson(roster));
  log.info(`roster: ${roster.players.length} players for ${team} week ${roster.week} -> ${path}`);
  return { week: roster.week, players: roster.players.length, path };
}
