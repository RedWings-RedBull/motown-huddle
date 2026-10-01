import { z } from "zod";

import { TeamProfile } from "./preview.js";

const count = () => z.number().int().min(0);

export const Standing = z
  .object({
    team: z.string(),
    rank: z.number().int().min(1).max(4),
    /** Tiebreaker step that settled this rank; null when the record alone decided it. */
    resolvedBy: z.string().nullable(),
    w: count(),
    l: count(),
    t: count(),
    pct: z.number().min(0).max(1),
    division: z.object({ w: count(), l: count(), t: count() }).strict(),
    conference: z.object({ w: count(), l: count(), t: count() }).strict(),
    pointsFor: count(),
    pointsAgainst: count(),
    /** "W3", "L1", or "T1"; empty before the first game. */
    streak: z.string(),
    /** Most recent first, at most five entries. */
    lastFive: z.array(z.enum(["W", "L", "T"])).max(5),
  })
  .strict();
export type Standing = z.infer<typeof Standing>;

export const TeamOdds = z
  .object({
    team: z.string(),
    /** Share of simulated seasons, 0..1. */
    division: z.number().min(0).max(1),
    playoffs: z.number().min(0).max(1),
    expectedWins: z.number().min(0),
    /** Index = regular-season wins; values are shares of simulated seasons. */
    winDistribution: z.array(z.number().min(0).max(1)),
  })
  .strict();
export type TeamOdds = z.infer<typeof TeamOdds>;

export const UpcomingGame = z
  .object({
    gameId: z.string(),
    week: z.number().int(),
    kickoffUtc: z.iso.datetime(),
    home: z.string(),
    away: z.string(),
    divGame: z.boolean(),
    /** Home-side spread as published; positive means the home team is favoured. */
    spread: z.number().nullable(),
  })
  .strict();

export const DivisionFile = z
  .object({
    season: z.number().int(),
    division: z.string(),
    conference: z.enum(["AFC", "NFC"]),
    /** Last league week with a final result. */
    throughWeek: z.number().int().min(0),
    standings: z.array(Standing).length(4),
    odds: z.array(TeamOdds).length(4),
    simulation: z
      .object({
        runs: z.number().int().positive(),
        seed: z.number().int(),
        /** Regular-season games still to be played when the simulation ran. */
        gamesRemaining: z.number().int().min(0),
      })
      .strict(),
    /** Season-to-date offense and defense for each division team, with league ranks. */
    profiles: z.array(TeamProfile).length(4),
    upcoming: z.array(UpcomingGame),
  })
  .strict();
export type DivisionFile = z.infer<typeof DivisionFile>;
