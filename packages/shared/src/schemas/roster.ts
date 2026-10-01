import { z } from "zod";

/** Roster page grouping; `ST` holds kickers, punters, long snappers and pure returners. */
export const PositionGroup = z.enum([
  "QB",
  "RB",
  "WR",
  "TE",
  "OL",
  "DL",
  "EDGE",
  "LB",
  "CB",
  "S",
  "ST",
]);
export type PositionGroup = z.infer<typeof PositionGroup>;

export const RosterPlayer = z
  .object({
    gsisId: z.string(),
    fullName: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    jersey: z.number().int().nullable(),
    position: z.string(),
    positionGroup: PositionGroup,
    depthChartPosition: z.string().nullable(),
    /** nflverse roster status code, e.g. ACT, RES, PUP, CUT. */
    status: z.string(),
    heightIn: z.number().int().nullable(),
    weightLb: z.number().int().nullable(),
    birthDate: z.string().nullable(),
    college: z.string().nullable(),
    yearsExp: z.number().int().nullable(),
    rookieYear: z.number().int().nullable(),
    draft: z
      .object({ year: z.number().int(), club: z.string(), overall: z.number().int() })
      .strict()
      .nullable(),
    ids: z.object({ pfr: z.string().nullable(), espn: z.string().nullable() }).strict(),
    injury: z
      .object({
        reportStatus: z.string().nullable(),
        primary: z.string().nullable(),
        practiceStatus: z.string().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type RosterPlayer = z.infer<typeof RosterPlayer>;

export const RosterFile = z
  .object({
    season: z.number().int(),
    week: z.number().int(),
    team: z.string(),
    players: z.array(RosterPlayer),
  })
  .strict();
export type RosterFile = z.infer<typeof RosterFile>;

export const SocialPlatform = z.enum(["x", "instagram", "tiktok", "youtube", "bluesky"]);
export type SocialPlatform = z.infer<typeof SocialPlatform>;

export const SocialLink = z
  .object({
    handle: z.string(),
    url: z.url(),
    /** Only verified links are rendered; Wikidata seeds start unverified. */
    verified: z.boolean(),
    source: z.enum(["wikidata", "manual"]),
    /** YYYY-MM-DD the link was last checked by a human. */
    checked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export type SocialLink = z.infer<typeof SocialLink>;

/** A null link means "confirmed none"; a missing key means "not researched yet". */
export const PlayerSocials = z
  .object({
    fullName: z.string(),
    socials: z.partialRecord(SocialPlatform, SocialLink.nullable()),
    notes: z.string().optional(),
  })
  .strict();
export type PlayerSocials = z.infer<typeof PlayerSocials>;

/** Keyed by gsis_id. Hand-curated; see docs/runbook.md#socials. */
export const SocialsFile = z.record(z.string(), PlayerSocials);
export type SocialsFile = z.infer<typeof SocialsFile>;
