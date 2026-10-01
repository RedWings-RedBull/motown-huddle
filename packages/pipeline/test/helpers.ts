import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GradeRequest,
  metricsForPool,
  Pool,
  type Grades,
  type LeagueBaselines,
  type Tier,
} from "@huddle/shared";

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
} from "../src/columns.js";
import { buildCrosswalk } from "../src/crosswalk.js";
import { readCsv } from "../src/csv.js";
import type { FetchLike } from "../src/download.js";
import type { Engine } from "../src/engine.js";
import type { WeekInputs } from "../src/inputs.js";
import { assetFileName, type AssetKey } from "../src/sources.js";
import { resolveWeek, weekKickoffs } from "../src/stages/resolveGame.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const SEASON = 2026;
const WEEK = 3;
export const GAME_ID = "2026_03_NYJ_DET";
const TEAM = "DET";

export const fixture = (name: string): string => join(FIXTURES, name);

/** Fixture file backing each nflverse asset (the real file names differ by season). */
const FIXTURE_FOR: Record<AssetKey, string> = {
  pbp: "play_by_play.csv.gz",
  statsPlayer: "stats_player_week.csv",
  snapCounts: "snap_counts.csv",
  ftn: "ftn_charting.csv",
  pfrPass: "advstats_week_pass.csv",
  pfrRush: "advstats_week_rush.csv",
  pfrRec: "advstats_week_rec.csv",
  pfrDef: "advstats_week_def.csv",
  depthCharts: "depth_charts.csv",
  players: "players.csv",
  games: "games.csv",
  ngsPassing: "ngs_passing.csv.gz",
  ngsRushing: "ngs_rushing.csv.gz",
  ngsReceiving: "ngs_receiving.csv.gz",
};

/** Loads the fixture slices into WeekInputs the way load.ts does, without any network. */
export async function loadFixtureInputs(tier: Tier = "provisional"): Promise<WeekInputs> {
  const week = forWeek(SEASON, WEEK);
  const games = await readCsv(fixture("games.csv"), { schema: GamesRow, keep: forSeason(SEASON) });
  const game = resolveWeek(games, TEAM, SEASON, WEEK);
  if (!game) throw new Error("fixture game missing");
  const players = await readCsv(fixture("players.csv"), { schema: PlayersRow });
  const pfr =
    tier === "final"
      ? {
          pass: await readCsv(fixture("advstats_week_pass.csv"), {
            schema: PfrPassRow,
            keep: week,
          }),
          rush: await readCsv(fixture("advstats_week_rush.csv"), {
            schema: PfrRushRow,
            keep: week,
          }),
          rec: await readCsv(fixture("advstats_week_rec.csv"), { schema: PfrRecRow, keep: week }),
          def: await readCsv(fixture("advstats_week_def.csv"), { schema: PfrDefRow, keep: week }),
        }
      : null;
  return {
    season: SEASON,
    week: WEEK,
    tier,
    team: TEAM,
    game,
    games,
    pbp: await readCsv(fixture("play_by_play.csv.gz"), { schema: PbpRow, keep: week }),
    stats: await readCsv(fixture("stats_player_week.csv"), { schema: StatsPlayerRow, keep: week }),
    snaps: await readCsv(fixture("snap_counts.csv"), { schema: SnapCountRow, keep: week }),
    ftn: await readCsv(fixture("ftn_charting.csv"), { schema: FtnRow, keep: week }),
    ngs: {
      passing: await readCsv(fixture("ngs_passing.csv.gz"), { schema: NgsPassingRow, keep: week }),
      rushing: await readCsv(fixture("ngs_rushing.csv.gz"), { schema: NgsRushingRow, keep: week }),
      receiving: await readCsv(fixture("ngs_receiving.csv.gz"), {
        schema: NgsReceivingRow,
        keep: week,
      }),
    },
    pfr,
    depthCharts: await readCsv(fixture("depth_charts.csv"), { schema: DepthChartRow }),
    kickoffs: weekKickoffs(games, SEASON, WEEK),
    crosswalk: buildCrosswalk(players),
    sources: { pbp: "2026-09-30 12:15:13 EDT", schedules: "2026-09-30 13:46:39 EDT" },
  };
}

/**
 * Stand-in for @huddle/grades that honours the fixed contract: validates the request, and returns
 * a schema-valid Grades artifact with one `na` tile per assignment plus empty baselines. Values are
 * derived from the request so determinism tests still exercise real content.
 */
export const stubEngine: Engine = {
  gradesVersion: "stub-0",
  gradeWeek(request) {
    GradeRequest.parse(request);
    const byId = new Map(request.players.map((p) => [p.gsisId, p]));
    const slots = new Map<string, Grades["slots"][number]>();
    for (const a of request.assignments) {
      const p = byId.get(a.gsisId);
      const slot = slots.get(a.slot) ?? {
        slot: a.slot,
        unit: a.unit,
        label: a.slot,
        tileGrade: null,
        bin: "na" as const,
        unitOnly: a.unit === "offense" && ["LT", "LG", "C", "RG", "RT"].includes(a.slot),
        players: [],
      };
      slot.players.push({
        gsisId: a.gsisId,
        name: p?.name ?? a.gsisId,
        jersey: p?.jersey ?? null,
        position: p?.position ?? "?",
        pool: p?.pool ?? "QB",
        snaps: a.snaps,
        snapPct: a.snapPct,
        grade: {
          value: null,
          bin: "na",
          rawComposite: null,
          n: p?.n ?? 0,
          k: 0,
          qualified: false,
          reason: "stub engine",
        },
        components: [],
        penalties: p?.penalties ?? [],
      });
      slots.set(a.slot, slot);
    }
    const pools = {} as Grades["pools"];
    const baselinePools = {} as LeagueBaselines["pools"];
    for (const pool of Pool.options) {
      const rows = request.players.filter((p) => p.pool === pool);
      pools[pool] = { n: rows.length, threshold: "stub" };
      const summaries: Record<string, LeagueBaselines["pools"][Pool][string]> = {};
      for (const def of metricsForPool(pool)) {
        const vals = rows
          .map((r) => r.values[def.key])
          .filter((v): v is number => typeof v === "number")
          .sort((a, b) => a - b);
        if (vals.length === 0) continue;
        const q = (f: number) => vals[Math.min(vals.length - 1, Math.floor(f * vals.length))] ?? 0;
        summaries[def.key] = {
          n: vals.length,
          p10: q(0.1),
          p25: q(0.25),
          p50: q(0.5),
          p75: q(0.75),
          p90: q(0.9),
        };
      }
      baselinePools[pool] = summaries;
    }
    return {
      grades: {
        season: request.season,
        week: request.week,
        gameId: request.gameId,
        tier: request.tier,
        slots: [...slots.values()],
        olUnit: {
          grade: {
            value: null,
            bin: "na",
            rawComposite: null,
            n: 0,
            k: 0,
            qualified: false,
            reason: "stub engine",
          },
          components: [],
          gapHeat: request.gapHeat,
        },
        pools,
      },
      baselines: {
        season: request.season,
        week: request.week,
        tier: request.tier,
        pools: baselinePools,
      },
    };
  },
};

/** A fetch that serves the fixture files for any nflverse URL (timestamp.txt -> a fixed stamp). */
export function fixtureFetch(stamps: Record<string, string> = {}): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const bySeasonFile = new Map<string, string>();
  for (const key of Object.keys(FIXTURE_FOR) as AssetKey[]) {
    bySeasonFile.set(assetFileName(key, SEASON), FIXTURE_FOR[key]);
  }
  const impl = async (url: string): Promise<Response> => {
    calls.push(url);
    const parts = url.split("/");
    const file = parts[parts.length - 1] ?? "";
    const tag = parts[parts.length - 2] ?? "";
    if (file === "timestamp.txt") return new Response(stamps[tag] ?? "2026-09-30 12:00:00 EDT");
    const name = bySeasonFile.get(file);
    if (!name) return new Response("not found", { status: 404 });
    const bytes = await readFile(fixture(name));
    return new Response(bytes);
  };
  return Object.assign(impl, { calls });
}
