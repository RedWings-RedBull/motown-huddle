import { z } from "zod";

import { Bin, Pool, Slot, Source, Tier, Unit, WeekId } from "./common.js";

const finite = () => z.number();
const nullableFinite = () => z.number().nullable();

/** One explainable sub-metric of a grade, as rendered in the UI. */
export const Component = z
  .object({
    key: z.string(),
    label: z.string(),
    source: Source,
    value: nullableFinite(),
    unit: z.enum(["rate", "pct", "epa", "yds", "count", "score"]),
    direction: z.enum(["higher", "lower"]),
    weight: finite().min(0).max(1),
    percentile: finite().min(0).max(100).nullable(),
    /** Player sample size for this component (attempts, targets, snaps ...). */
    n: z.number().int().min(0),
    /** Number of qualifying players in the league-wide pool this week. */
    poolN: z.number().int().min(0),
  })
  .strict();
export type Component = z.infer<typeof Component>;

export const GradeValue = z
  .object({
    value: finite().min(0).max(100).nullable(),
    bin: Bin,
    rawComposite: nullableFinite(),
    n: z.number().int().min(0),
    k: finite().min(0),
    qualified: z.boolean(),
    /** Why there is no grade: "below 14 dropbacks", "PFR pending" ... */
    reason: z.string().nullable(),
  })
  .strict();
export type GradeValue = z.infer<typeof GradeValue>;

export const Penalty = z.object({ type: z.string(), yards: finite() }).strict();

export const PlayerGrade = z
  .object({
    gsisId: z.string(),
    name: z.string(),
    jersey: z.number().int().nullable(),
    position: z.string(),
    pool: Pool,
    snaps: z.number().int().min(0),
    snapPct: finite().min(0).max(1),
    grade: GradeValue,
    components: z.array(Component),
    penalties: z.array(Penalty).default([]),
  })
  .strict();
export type PlayerGrade = z.infer<typeof PlayerGrade>;

export const SlotGrade = z
  .object({
    slot: Slot,
    unit: Unit,
    label: z.string(),
    tileGrade: finite().min(0).max(100).nullable(),
    bin: Bin,
    /** True for OL slots: the tile shows a unit grade, never a fabricated per-lineman grade. */
    unitOnly: z.boolean(),
    players: z.array(PlayerGrade),
  })
  .strict();
export type SlotGrade = z.infer<typeof SlotGrade>;

export const GapHeat = z
  .object({
    zone: z.enum(["LT", "LG", "C", "RG", "RT"]),
    epaPerRush: finite(),
    successRate: finite().min(0).max(1),
    n: z.number().int().min(0),
  })
  .strict();

export const Grades = WeekId.extend({
  tier: Tier,
  slots: z.array(SlotGrade),
  olUnit: z
    .object({ grade: GradeValue, components: z.array(Component), gapHeat: z.array(GapHeat) })
    .strict(),
  pools: z.record(Pool, z.object({ n: z.number().int().min(0), threshold: z.string() }).strict()),
}).strict();
export type Grades = z.infer<typeof Grades>;

export const Score = z.object({ team: z.string(), score: z.number().int().min(0) }).strict();

export const GameSummary = WeekId.extend({
  kickoffUtc: z.iso.datetime(),
  home: Score,
  away: Score,
  team: z
    .object({
      side: z.enum(["home", "away"]),
      opponent: z.string(),
      result: z.enum(["W", "L", "T"]),
    })
    .strict(),
  overtime: z.boolean(),
  venue: z
    .object({
      stadium: z.string(),
      roof: z.string(),
      surface: z.string(),
      temp: nullableFinite(),
      wind: nullableFinite(),
    })
    .strict(),
  line: z.object({ spread: nullableFinite(), total: nullableFinite() }).strict(),
  tier: Tier,
}).strict();
export type GameSummary = z.infer<typeof GameSummary>;

export const Metric = z
  .object({
    value: finite(),
    leaguePercentile: finite().min(0).max(100),
    leagueRank: z.number().int().min(1).max(32),
    n: z.number().int().min(0),
  })
  .strict();
export type Metric = z.infer<typeof Metric>;

export const SideMetrics = z
  .object({
    epaPerPlay: Metric,
    successRate: Metric,
    passEpaPerDropback: Metric,
    rushEpaPerAtt: Metric,
    explosiveRate: Metric,
    sackRate: Metric,
    thirdDownRate: Metric,
    fourthDown: z.object({ att: z.number().int().min(0), conv: z.number().int().min(0) }).strict(),
    turnovers: z.number().int().min(0),
    penalties: z.object({ count: z.number().int().min(0), yards: z.number().int() }).strict(),
  })
  .strict();
export type SideMetrics = z.infer<typeof SideMetrics>;

export const TeamMetrics = WeekId.extend({
  tier: Tier,
  team: SideMetrics,
  opponent: SideMetrics,
  teamGrade: z
    .object({
      offense: finite().min(0).max(100),
      defense: finite().min(0).max(100),
      specialTeams: finite().min(0).max(100),
      overall: finite().min(0).max(100),
    })
    .strict(),
}).strict();
export type TeamMetrics = z.infer<typeof TeamMetrics>;

export const KeyPlay = z
  .object({
    playId: z.number().int(),
    qtr: z.number().int().min(1).max(6),
    clock: z.string(),
    down: z.number().int().min(1).max(4).nullable(),
    ydstogo: z.number().int().nullable(),
    yardline100: z.number().int().min(1).max(100).nullable(),
    posteam: z.string(),
    desc: z.string(),
    epa: finite(),
    wpa: finite(),
    tags: z.array(z.enum(["td", "turnover", "fourth-down", "sack", "explosive", "fg", "penalty"])),
  })
  .strict();
export type KeyPlay = z.infer<typeof KeyPlay>;

export const KeyPlays = WeekId.extend({ plays: z.array(KeyPlay).max(12) }).strict();
export type KeyPlays = z.infer<typeof KeyPlays>;

export const WinProbPoint = z
  .object({
    playId: z.number().int(),
    secondsRemaining: z.number().int().min(0),
    qtr: z.number().int().min(1).max(6),
    /** Win probability from the configured team's perspective. */
    teamWp: finite().min(0).max(1),
    vegasTeamWp: finite().min(0).max(1).nullable(),
    teamScore: z.number().int().min(0),
    oppScore: z.number().int().min(0),
  })
  .strict();

export const WinProbability = WeekId.extend({ points: z.array(WinProbPoint) }).strict();
export type WinProbability = z.infer<typeof WinProbability>;

export const WeekMeta = WeekId.extend({
  tier: Tier,
  pipelineVersion: z.string(),
  gradesVersion: z.string(),
  /** nflverse release tag -> timestamp.txt value used for this build. */
  sources: z.record(z.string(), z.string()),
}).strict();
export type WeekMeta = z.infer<typeof WeekMeta>;

export const ManifestEntry = WeekId.extend({
  tier: Tier,
  opponent: z.string(),
  result: z.enum(["W", "L", "T"]),
}).strict();

export const Manifest = z.object({ weeks: z.array(ManifestEntry) }).strict();
export type Manifest = z.infer<typeof Manifest>;

/** The only league-wide data published: distribution summaries per pool and metric. */
export const BaselineSummary = z
  .object({
    n: z.number().int().min(0),
    p10: finite(),
    p25: finite(),
    p50: finite(),
    p75: finite(),
    p90: finite(),
  })
  .strict();

export const LeagueBaselines = z
  .object({
    season: z.number().int(),
    week: z.number().int(),
    tier: Tier,
    /** pool -> metric key -> summary */
    pools: z.record(Pool, z.record(z.string(), BaselineSummary)),
  })
  .strict();
export type LeagueBaselines = z.infer<typeof LeagueBaselines>;
