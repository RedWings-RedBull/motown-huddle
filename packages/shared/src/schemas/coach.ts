import { z } from "zod";

import { DISTANCE_BUCKETS, FIELD_BINS } from "../fourthDown.js";

const rateCell = z.object({ rate: z.number().min(0).max(1), n: z.number().int().min(0) }).strict();
const byField = z.record(z.enum(FIELD_BINS), rateCell);

export const CalculatorTablesSchema = z
  .object({
    conversion: z.record(z.enum(DISTANCE_BUCKETS), byField),
    fieldGoal: z.array(rateCell),
    punt: z.array(z.object({ yards: z.number(), n: z.number().int().min(0) }).strict()),
    winProbability: z.array(z.array(z.array(z.array(z.number().min(0).max(1).nullable())))),
  })
  .strict();

export const DecisionSchema = z.enum(["go", "punt", "fg"]);

export const AggressionSeason = z
  .object({
    season: z.number().int(),
    /** Percentage points above the league go rate, situation-weighted. */
    index: z.number(),
    rank: z.number().int().min(1).max(32),
    goRate: z.number().min(0).max(1),
    leagueGoRate: z.number().min(0).max(1),
    decisions: z.number().int().min(0),
    goes: z.number().int().min(0),
    conversions: z.number().int().min(0),
  })
  .strict();

export const LeagueIndexRow = z
  .object({ team: z.string(), index: z.number(), rank: z.number().int(), goRate: z.number() })
  .strict();

export const DecisionEntry = z
  .object({
    gameId: z.string(),
    week: z.number().int(),
    opponent: z.string(),
    playId: z.number().int(),
    qtr: z.number().int(),
    clock: z.string(),
    yardline100: z.number().int(),
    ydstogo: z.number().int(),
    scoreDiff: z.number().int(),
    wpPre: z.number().min(0).max(1),
    decision: DecisionSchema,
    result: z.string(),
    epa: z.number().nullable(),
    wpa: z.number().nullable(),
    /** Fourth quarter, under four minutes, trailing: the decision was dictated by the clock. */
    forced: z.boolean(),
    calc: z
      .object({
        goWp: z.number(),
        puntWp: z.number(),
        fgWp: z.number().nullable(),
        recommended: DecisionSchema,
      })
      .strict(),
    desc: z.string(),
  })
  .strict();

const tally = z.object({ w: z.number().int(), l: z.number().int(), t: z.number().int() }).strict();

export const EraSeason = z
  .object({
    season: z.number().int(),
    regular: tally,
    postseason: tally,
    home: tally,
    away: tally,
    oneScore: tally,
    favorite: tally,
    underdog: tally,
    division: tally,
  })
  .strict();

export const CoachFile = z
  .object({
    season: z.number().int(),
    team: z.string(),
    /** Head coach as listed in the schedule for the team's latest game. */
    coach: z.string(),
    throughWeek: z.number().int().min(0),
    firstSeason: z.number().int(),
    index: z.array(AggressionSeason),
    /** Every club with at least one eligible decision this season, ranked. */
    league: z.array(LeagueIndexRow).max(32),
    log: z.array(DecisionEntry),
    era: z.array(EraSeason),
    tables: CalculatorTablesSchema,
    /** Seasons of play-by-play behind the calculator tables. */
    tableSeasons: z.array(z.number().int()),
  })
  .strict();
export type CoachFile = z.infer<typeof CoachFile>;
export type DecisionEntry = z.infer<typeof DecisionEntry>;
export type EraSeason = z.infer<typeof EraSeason>;
export type AggressionSeason = z.infer<typeof AggressionSeason>;
export type LeagueIndexRow = z.infer<typeof LeagueIndexRow>;

export const Quote = z
  .object({
    quote: z.string().min(1).max(240),
    date: z.iso.date(),
    context: z.string().min(1),
    sourceName: z.string().min(1),
    sourceUrl: z.url(),
  })
  .strict();

export const QuotesFile = z.object({ quotes: z.array(Quote).max(10) }).strict();
export type QuotesFile = z.infer<typeof QuotesFile>;
