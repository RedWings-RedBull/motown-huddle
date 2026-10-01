import { z } from "zod";

import { SideMetrics } from "./artifacts.js";

export const Record_ = z
  .object({ w: z.number().int(), l: z.number().int(), t: z.number().int() })
  .strict();

/** Season-to-date profile of one team: its offense and what its defense allows. */
export const TeamProfile = z
  .object({
    team: z.string(),
    record: Record_,
    offense: SideMetrics,
    /** Opponents' offense against this team; percentiles/ranks already inverted (1 = best). */
    defense: SideMetrics,
  })
  .strict();
export type TeamProfile = z.infer<typeof TeamProfile>;

export const InjuryLine = z
  .object({
    team: z.string(),
    gsisId: z.string(),
    name: z.string(),
    position: z.string(),
    reportStatus: z.string().nullable(),
    primary: z.string().nullable(),
    practiceStatus: z.string().nullable(),
  })
  .strict();
export type InjuryLine = z.infer<typeof InjuryLine>;

export const Meeting = z
  .object({
    season: z.number().int(),
    week: z.number().int(),
    gameId: z.string(),
    result: z.enum(["W", "L", "T"]),
    teamScore: z.number().int(),
    oppScore: z.number().int(),
    home: z.boolean(),
  })
  .strict();
export type Meeting = z.infer<typeof Meeting>;

export const KeyMatchup = z
  .object({
    label: z.string(),
    teamRank: z.number().int(),
    oppRank: z.number().int(),
    edge: z.enum(["team", "opponent", "even"]),
  })
  .strict();
export type KeyMatchup = z.infer<typeof KeyMatchup>;

export const MatchupPreview = z
  .object({
    season: z.number().int(),
    week: z.number().int(),
    gameId: z.string(),
    kickoffUtc: z.iso.datetime(),
    isHome: z.boolean(),
    opponent: z.string(),
    divGame: z.boolean(),
    venue: z
      .object({
        stadium: z.string().nullable(),
        roof: z.string().nullable(),
        surface: z.string().nullable(),
        temp: z.number().nullable(),
        wind: z.number().nullable(),
      })
      .strict(),
    line: z.object({ spread: z.number().nullable(), total: z.number().nullable() }).strict(),
    rest: z
      .object({ team: z.number().int().nullable(), opponent: z.number().int().nullable() })
      .strict(),
    quarterbacks: z
      .object({ team: z.string().nullable(), opponent: z.string().nullable() })
      .strict(),
    coaches: z.object({ team: z.string().nullable(), opponent: z.string().nullable() }).strict(),
    referee: z.string().nullable(),
    /** Weeks of data behind the splits (the last completed league week). */
    throughWeek: z.number().int(),
    team: TeamProfile,
    opp: TeamProfile,
    keyMatchups: z.array(KeyMatchup),
    injuries: z.array(InjuryLine),
    lastMeetings: z.array(Meeting).max(5),
  })
  .strict();
export type MatchupPreview = z.infer<typeof MatchupPreview>;
