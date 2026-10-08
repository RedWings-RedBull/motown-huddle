import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { GameHighlights, HighlightVideo } from "@huddle/shared";
import { GameHighlights as GameHighlightsSchema } from "@huddle/shared";

import { GamesRow } from "../columns.js";
import { readCsv } from "../csv.js";
import { type DownloadOptions, type FetchLike, fetchAsset } from "../download.js";
import { NotReadyError } from "../errors.js";
import { type Logger, silentLogger } from "../log.js";
import { resolveLatest, resolveWeek } from "../stages/resolveGame.js";
import { stableJson, weekDirName } from "../stages/write.js";
import { NFL_CHANNEL_ID, pickGameHighlights, searchQuery, searchUrl } from "./match.js";
import { searchVideos } from "./youtube.js";

export interface HighlightsRunOptions extends DownloadOptions {
  season: number;
  week: number | "auto";
  team?: string;
  dataDir: string;
  /** YouTube Data API key. Without one the file keeps what it had plus the search link. */
  apiKey?: string | undefined;
  now?: Date;
  /** Fetch used for the YouTube API (the nflverse download uses `fetchImpl`). */
  youtubeFetch?: FetchLike;
  log?: Logger;
}

export interface HighlightsRunResult {
  gameId: string | null;
  path: string | null;
  found: boolean;
}

/** The league posts within hours; a week covers the Tuesday and Friday reruns. */
const WINDOW_DAYS = 7;

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Finds the official game-highlights video for one built week and writes game-highlights.json. */
export async function runHighlights(options: HighlightsRunOptions): Promise<HighlightsRunResult> {
  const log = options.log ?? silentLogger;
  const team = options.team ?? "DET";
  const { season } = options;
  const now = options.now ?? new Date();

  const gamesAsset = await fetchAsset("games", season, { ...options, log });
  const games = await readCsv(gamesAsset.path, { schema: GamesRow, label: gamesAsset.file });
  const game =
    options.week === "auto"
      ? resolveLatest(games, team, season, now)
      : resolveWeek(games, team, season, options.week);
  if (game === null) {
    log.warn(`highlights: no ${team} game for season ${season} week ${String(options.week)}`);
    return { gameId: null, path: null, found: false };
  }

  const dir = join(options.dataDir, String(season), weekDirName(game.week));
  if ((await readJson(join(dir, "game.json"))) === null) {
    throw new NotReadyError(
      `highlights: ${dir}/game.json is missing; build the week first (--season ${season} --week ${game.week})`,
    );
  }
  const path = join(dir, "game-highlights.json");
  const existingRaw = await readJson(path);
  const existing = existingRaw === null ? null : GameHighlightsSchema.parse(existingRaw);

  const home = game.side === "home" ? team : game.opponent;
  const away = game.side === "home" ? game.opponent : team;

  let video: HighlightVideo | null = existing?.video ?? null;
  if (video?.source === "manual") {
    log.info(`highlights: ${game.gameId} keeps its manual entry ("${video.title}")`);
  } else if (!options.apiKey) {
    log.warn("highlights: HUDDLE_YOUTUBE_API_KEY is not set; keeping the existing entry");
  } else {
    const kickoff = Date.parse(game.kickoffUtc);
    const candidates = await searchVideos({
      apiKey: options.apiKey,
      q: searchQuery(home, away),
      channelId: NFL_CHANNEL_ID,
      publishedAfter: new Date(kickoff).toISOString(),
      publishedBefore: new Date(kickoff + WINDOW_DAYS * 86_400_000).toISOString(),
      ...(options.youtubeFetch ? { fetch: options.youtubeFetch } : {}),
    });
    const pick = pickGameHighlights(candidates, home, away, game.week);
    if (pick) {
      video = {
        videoId: pick.videoId,
        url: `https://www.youtube.com/watch?v=${pick.videoId}`,
        title: pick.title,
        channel: pick.channel || "NFL",
        publishedAt: pick.publishedAt,
        source: "youtube-api",
      };
      log.info(`highlights: ${game.gameId} -> "${pick.title}"`);
    } else {
      // Keep a previously found video rather than dropping it on a quiet search.
      log.warn(
        `highlights: no official game-highlights video for ${game.gameId} among ${candidates.length} results yet`,
      );
    }
  }

  const file: GameHighlights = GameHighlightsSchema.parse({
    season,
    week: game.week,
    gameId: game.gameId,
    video,
    searchUrl: searchUrl(season, game.week, home, away),
  });
  await writeFile(path, stableJson(file));
  return { gameId: game.gameId, path, found: video !== null };
}
