import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { HighlightCandidate, HighlightVideo, Highlights } from "@huddle/shared";
import { Highlights as HighlightsSchema, KeyPlays, teamName } from "@huddle/shared";

import { GamesRow } from "../columns.js";
import { readCsv } from "../csv.js";
import { type DownloadOptions, type FetchLike, fetchAsset } from "../download.js";
import { NotReadyError } from "../errors.js";
import { type Logger, silentLogger } from "../log.js";
import { resolveLatest, resolveWeek } from "../stages/resolveGame.js";
import { stableJson, weekDirName } from "../stages/write.js";
import {
  isGameHighlights,
  isOfficial,
  matchClips,
  queryPhrasings,
  searchUrl,
  topCandidates,
  toVideo,
  type VideoCandidate,
} from "./match.js";
import { checkEmbeddable, type EmbedResult } from "./embedCheck.js";
import { searchVideos } from "./youtube.js";

export interface HighlightsRunOptions extends DownloadOptions {
  season: number;
  week: number | "auto";
  team?: string;
  dataDir: string;
  /** YouTube Data API key. Without one only the search fallback and manual entries are written. */
  apiKey?: string | undefined;
  now?: Date;
  /** Fetch used for the YouTube API (the nflverse download uses `fetchImpl`). */
  youtubeFetch?: FetchLike;
  /** Headless embed check; defaults to Playwright. Tests inject a fake. */
  embedCheck?: (ids: readonly string[]) => Promise<Map<string, EmbedResult>>;
  log?: Logger;
}

export interface HighlightsRunResult {
  gameId: string | null;
  path: string | null;
  clips: number;
  game: boolean;
  searches: number;
}

const WINDOW_HOURS = 48;

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Links key plays of one week to YouTube videos; manual entries always survive a rerun. */
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
    return { gameId: null, path: null, clips: 0, game: false, searches: 0 };
  }

  const dir = join(options.dataDir, String(season), weekDirName(game.week));
  const keyPlaysRaw = await readJson(join(dir, "key-plays.json"));
  if (keyPlaysRaw === null) {
    throw new NotReadyError(
      `highlights: ${dir}/key-plays.json is missing; build the week first (--season ${season} --week ${game.week})`,
    );
  }
  const keyPlays = KeyPlays.parse(keyPlaysRaw);
  const existingRaw = await readJson(join(dir, "highlights.json"));
  const existing = existingRaw === null ? null : HighlightsSchema.parse(existingRaw);

  const home = game.side === "home" ? team : game.opponent;
  const away = game.side === "home" ? game.opponent : team;
  const manualPlays = Object.fromEntries(
    Object.entries(existing?.plays ?? {}).filter(([, v]) => v.source === "manual"),
  );
  const manualGame = existing?.game?.source === "manual" ? existing.game : null;

  let apiGame: HighlightVideo | null = null;
  const apiPlays: Record<string, HighlightVideo> = {};
  const candidates: Record<string, HighlightCandidate[]> = {};
  let searches = 0;
  if (options.apiKey) {
    const kickoff = Date.parse(game.kickoffUtc);
    const window = {
      publishedAfter: new Date(kickoff).toISOString(),
      publishedBefore: new Date(kickoff + WINDOW_HOURS * 3600_000).toISOString(),
    };
    const search = async (q: string): Promise<VideoCandidate[]> => {
      searches += 1;
      return searchVideos({
        apiKey: options.apiKey ?? "",
        q,
        ...window,
        ...(options.youtubeFetch ? { fetch: options.youtubeFetch } : {}),
      });
    };

    const pool = new Map<string, VideoCandidate>();
    const add = (videos: VideoCandidate[]) => {
      for (const v of videos) if (isOfficial(v, home, away)) pool.set(v.videoId, v);
    };
    add(await search(`${teamName(away)} vs. ${teamName(home)} Game Highlights`));
    const queries = new Set<string>();
    const plays = keyPlays.plays.filter((p) => !(String(p.playId) in manualPlays));
    for (const play of plays) for (const q of queryPhrasings(play, home, away)) queries.add(q);
    for (const q of queries) add(await search(q));
    log.info(`highlights: ${searches} searches, ${pool.size} official candidate videos`);

    const all = [...pool.values()];
    const gameVideo = all.find((v) => isGameHighlights(v.title, home, away));
    const matches = matchClips(plays, all, kickoff);
    const check = options.embedCheck ?? checkEmbeddable;
    const embeddable = await check([
      ...(gameVideo ? [gameVideo.videoId] : []),
      ...matches.map((m) => m.video.videoId),
    ]);
    const canEmbed = (id: string) => embeddable.get(id) === "embeddable";
    if (gameVideo) apiGame = toVideo(gameVideo, "game", canEmbed(gameVideo.videoId));
    for (const play of plays) {
      const top = topCandidates(play, all, kickoff);
      if (top.length > 0) candidates[String(play.playId)] = top;
    }
    for (const m of matches) {
      const ok = canEmbed(m.video.videoId);
      apiPlays[String(m.playId)] = toVideo(m.video, "clip", ok);
      log.info(
        `highlights: play ${m.playId} -> "${m.video.title}" (score ${m.score}, ${ok ? "plays in place" : "opens on YouTube"})`,
      );
    }
  } else {
    log.warn(
      "highlights: HUDDLE_YOUTUBE_API_KEY is not set; keeping existing entries and the search link only",
    );
  }

  const file: Highlights = HighlightsSchema.parse({
    season,
    week: game.week,
    gameId: game.gameId,
    game: manualGame ?? apiGame ?? (options.apiKey ? null : (existing?.game ?? null)),
    plays: options.apiKey
      ? { ...apiPlays, ...manualPlays }
      : { ...(existing?.plays ?? {}), ...manualPlays },
    candidates: options.apiKey ? candidates : (existing?.candidates ?? {}),
    searchUrl: searchUrl(season, game.week, home, away),
  });
  const path = join(dir, "highlights.json");
  await writeFile(path, stableJson(file));
  const clips = Object.keys(file.plays).length;
  log.info(
    `highlights: ${game.gameId} -> ${clips} play videos, game video ${file.game ? "found" : "none"} -> ${path}`,
  );
  return { gameId: game.gameId, path, clips, game: file.game !== null, searches };
}
