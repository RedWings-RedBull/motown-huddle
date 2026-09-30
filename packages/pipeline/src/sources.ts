/**
 * nflverse release assets used by the pipeline. Every download URL follows
 * https://github.com/nflverse/nflverse-data/releases/download/<tag>/<file>, answers with a 302 to a
 * signed release-assets URL, and each tag also serves a `timestamp.txt` beside the assets that the
 * cache uses for change detection (no GitHub API calls, no rate limit).
 *
 * The legacy `player_stats` tag stops at 2024 and is deliberately absent.
 */
const NFLVERSE_BASE = "https://github.com/nflverse/nflverse-data/releases/download";

export type AssetKey =
  | "pbp"
  | "statsPlayer"
  | "snapCounts"
  | "ftn"
  | "pfrPass"
  | "pfrRush"
  | "pfrRec"
  | "pfrDef"
  | "depthCharts"
  | "players"
  | "games"
  | "ngsPassing"
  | "ngsRushing"
  | "ngsReceiving";

export interface AssetSpec {
  key: AssetKey;
  tag: string;
  /** File name inside the release tag; `<season>` is substituted when `perSeason` is true. */
  file: string;
  perSeason: boolean;
  /** Only downloaded for the Final tier (PFR advanced stats lag Sunday games by 3+ days). */
  finalOnly: boolean;
  /** Attribution surfaced in meta.json / the site footer. */
  license: "CC-BY-4.0" | "CC-BY-SA-4.0";
}

export const ASSETS: readonly AssetSpec[] = [
  {
    key: "pbp",
    tag: "pbp",
    file: "play_by_play_<season>.csv.gz",
    perSeason: true,
    finalOnly: false,
    license: "CC-BY-4.0",
  },
  {
    key: "statsPlayer",
    tag: "stats_player",
    file: "stats_player_week_<season>.csv",
    perSeason: true,
    finalOnly: false,
    license: "CC-BY-4.0",
  },
  {
    key: "snapCounts",
    tag: "snap_counts",
    file: "snap_counts_<season>.csv",
    perSeason: true,
    finalOnly: false,
    license: "CC-BY-4.0",
  },
  {
    key: "ftn",
    tag: "ftn_charting",
    file: "ftn_charting_<season>.csv",
    perSeason: true,
    finalOnly: false,
    license: "CC-BY-SA-4.0",
  },
  {
    key: "pfrPass",
    tag: "pfr_advstats",
    file: "advstats_week_pass_<season>.csv",
    perSeason: true,
    finalOnly: true,
    license: "CC-BY-4.0",
  },
  {
    key: "pfrRush",
    tag: "pfr_advstats",
    file: "advstats_week_rush_<season>.csv",
    perSeason: true,
    finalOnly: true,
    license: "CC-BY-4.0",
  },
  {
    key: "pfrRec",
    tag: "pfr_advstats",
    file: "advstats_week_rec_<season>.csv",
    perSeason: true,
    finalOnly: true,
    license: "CC-BY-4.0",
  },
  {
    key: "pfrDef",
    tag: "pfr_advstats",
    file: "advstats_week_def_<season>.csv",
    perSeason: true,
    finalOnly: true,
    license: "CC-BY-4.0",
  },
  {
    key: "depthCharts",
    tag: "depth_charts",
    file: "depth_charts_<season>.csv",
    perSeason: true,
    finalOnly: false,
    license: "CC-BY-4.0",
  },
  {
    key: "players",
    tag: "players",
    file: "players.csv",
    perSeason: false,
    finalOnly: false,
    license: "CC-BY-4.0",
  },
  {
    key: "games",
    tag: "schedules",
    file: "games.csv",
    perSeason: false,
    finalOnly: false,
    license: "CC-BY-4.0",
  },
  {
    key: "ngsPassing",
    tag: "nextgen_stats",
    file: "ngs_passing.csv.gz",
    perSeason: false,
    finalOnly: false,
    license: "CC-BY-4.0",
  },
  {
    key: "ngsRushing",
    tag: "nextgen_stats",
    file: "ngs_rushing.csv.gz",
    perSeason: false,
    finalOnly: false,
    license: "CC-BY-4.0",
  },
  {
    key: "ngsReceiving",
    tag: "nextgen_stats",
    file: "ngs_receiving.csv.gz",
    perSeason: false,
    finalOnly: false,
    license: "CC-BY-4.0",
  },
];

const byKey = new Map(ASSETS.map((a) => [a.key, a] as const));

export function assetSpec(key: AssetKey): AssetSpec {
  const spec = byKey.get(key);
  if (!spec) throw new Error(`unknown asset ${key}`);
  return spec;
}

export function assetFileName(key: AssetKey, season: number): string {
  return assetSpec(key).file.replace("<season>", String(season));
}

export function assetUrl(tag: string, file: string): string {
  return `${NFLVERSE_BASE}/${tag}/${file}`;
}

export function timestampUrl(tag: string): string {
  return assetUrl(tag, "timestamp.txt");
}

/** Tags needed for a tier, in a stable order (used for meta.json `sources`). */
export function tagsForTier(tier: "provisional" | "final"): string[] {
  const tags = new Set<string>();
  for (const a of ASSETS) if (!a.finalOnly || tier === "final") tags.add(a.tag);
  return [...tags].sort();
}
