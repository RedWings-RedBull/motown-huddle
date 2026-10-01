import { subDays } from "date-fns";

import type { Tier } from "@huddle/shared";

import {
  DepthChartRow,
  FtnRow,
  GamesRow,
  NgsPassingRow,
  NgsReceivingRow,
  NgsRushingRow,
  PbpRow,
  PfrDefRow,
  PfrPassRow,
  PfrRecRow,
  PfrRushRow,
  PlayersRow,
  SnapCountRow,
  StatsPlayerRow,
  forSeason,
  forWeek,
} from "./columns.js";
import { buildCrosswalk } from "./crosswalk.js";
import { readCsv } from "./csv.js";
import { fetchAsset, type CachedAsset, type DownloadOptions } from "./download.js";
import { NotReadyError } from "./errors.js";
import type { WeekInputs } from "./inputs.js";
import { silentLogger, type Logger } from "./log.js";
import type { AssetKey } from "./sources.js";
import {
  resolveLatest,
  resolveWeek,
  weekKickoffs,
  type ResolvedGame,
} from "./stages/resolveGame.js";

export interface LoadOptions extends DownloadOptions {
  season: number;
  week: number | "auto";
  tier: Tier;
  team?: string;
  now?: Date;
  log?: Logger;
}

const DEPTH_CHART_WINDOW_DAYS = 8;

/**
 * Downloads (or reuses from cache) every asset the tier needs and reduces each file to the
 * requested week in-stream. Returns null on a bye week. Throws NotReadyError when `auto` finds no
 * completed game yet.
 */
export async function loadWeekInputs(options: LoadOptions): Promise<WeekInputs | null> {
  const log = options.log ?? silentLogger;
  const team = options.team ?? "DET";
  const { season, tier } = options;
  const sources: Record<string, string> = {};
  const get = async (key: AssetKey): Promise<CachedAsset> => {
    const asset = await fetchAsset(key, season, { ...options, log });
    sources[asset.tag] = asset.stamp;
    return asset;
  };

  const gamesAsset = await get("games");
  const games = await readCsv(gamesAsset.path, {
    schema: GamesRow,
    keep: forSeason(season),
    label: gamesAsset.file,
  });
  const game = resolveGame(games, team, season, options.week, options.now ?? new Date());
  if (game === null) return null;
  const week = game.week;
  log.info(`resolved ${game.gameId} (kickoff ${game.kickoffUtc}, ${tier})`);

  const weekOnly = forWeek(season, week);
  const pbpAsset = await get("pbp");
  const pbp = await readCsv(pbpAsset.path, {
    schema: PbpRow,
    keep: weekOnly,
    label: pbpAsset.file,
  });
  const statsAsset = await get("statsPlayer");
  const stats = await readCsv(statsAsset.path, {
    schema: StatsPlayerRow,
    keep: weekOnly,
    label: statsAsset.file,
  });
  const snapsAsset = await get("snapCounts");
  const snaps = await readCsv(snapsAsset.path, {
    schema: SnapCountRow,
    keep: weekOnly,
    label: snapsAsset.file,
  });
  const ftnAsset = await get("ftn");
  const ftn = await readCsv(ftnAsset.path, {
    schema: FtnRow,
    keep: weekOnly,
    label: ftnAsset.file,
  });
  const playersAsset = await get("players");
  const players = await readCsv(playersAsset.path, {
    schema: PlayersRow,
    label: playersAsset.file,
  });

  const kickoffs = weekKickoffs(games, season, week);
  const earliestKickoff = Math.min(...[...kickoffs.values()].map((k) => Date.parse(k)));
  const windowStart = subDays(new Date(earliestKickoff), DEPTH_CHART_WINDOW_DAYS).toISOString();
  const windowEnd = [...kickoffs.values()].sort().at(-1) ?? game.kickoffUtc;
  const depthAsset = await get("depthCharts");
  const depthCharts = await readCsv(depthAsset.path, {
    schema: DepthChartRow,
    keep: (r) => {
      const dt = r.dt ?? "";
      return dt >= windowStart && dt <= windowEnd;
    },
    label: depthAsset.file,
  });

  const ngsKeep = (r: Record<string, string>) => weekOnly(r);
  const ngsPassAsset = await get("ngsPassing");
  const ngsRushAsset = await get("ngsRushing");
  const ngsRecAsset = await get("ngsReceiving");
  const ngs = {
    passing: await readCsv(ngsPassAsset.path, {
      schema: NgsPassingRow,
      keep: ngsKeep,
      label: ngsPassAsset.file,
    }),
    rushing: await readCsv(ngsRushAsset.path, {
      schema: NgsRushingRow,
      keep: ngsKeep,
      label: ngsRushAsset.file,
    }),
    receiving: await readCsv(ngsRecAsset.path, {
      schema: NgsReceivingRow,
      keep: ngsKeep,
      label: ngsRecAsset.file,
    }),
  };

  let pfr: WeekInputs["pfr"] = null;
  if (tier === "final") {
    const [pass, rush, rec, def] = await Promise.all([
      get("pfrPass"),
      get("pfrRush"),
      get("pfrRec"),
      get("pfrDef"),
    ]);
    pfr = {
      pass: await readCsv(pass.path, { schema: PfrPassRow, keep: weekOnly, label: pass.file }),
      rush: await readCsv(rush.path, { schema: PfrRushRow, keep: weekOnly, label: rush.file }),
      rec: await readCsv(rec.path, { schema: PfrRecRow, keep: weekOnly, label: rec.file }),
      def: await readCsv(def.path, { schema: PfrDefRow, keep: weekOnly, label: def.file }),
    };
  } else {
    log.info("provisional tier: PFR advanced stats skipped");
  }

  return {
    season,
    week,
    tier,
    team,
    game,
    games,
    pbp,
    stats,
    snaps,
    ftn,
    ngs,
    pfr,
    depthCharts,
    kickoffs,
    crosswalk: buildCrosswalk(players),
    sources,
  };
}

function resolveGame(
  games: GamesRow[],
  team: string,
  season: number,
  week: number | "auto",
  now: Date,
): ResolvedGame | null {
  if (week === "auto") {
    const latest = resolveLatest(games, team, season, now);
    if (latest === null) {
      throw new NotReadyError(`${team} has no completed game in ${season} yet`);
    }
    return latest;
  }
  return resolveWeek(games, team, season, week);
}
