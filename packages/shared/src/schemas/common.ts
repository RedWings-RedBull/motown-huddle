import { z } from "zod";

/** Provisional grades use pbp + stats + snaps + FTN + NGS; Final adds PFR advanced stats. */
export const Tier = z.enum(["provisional", "final"]);
export type Tier = z.infer<typeof Tier>;

/** Seven diverging bins plus `na` (did not play, below threshold, or pending). */
export const Bin = z.enum(["ice", "cold", "cool", "neutral", "warm", "hot", "fire", "na"]);
export type Bin = z.infer<typeof Bin>;

export const Source = z.enum(["pbp", "stats_player", "snap_counts", "ftn", "ngs", "pfr", "games"]);
export type Source = z.infer<typeof Source>;

export const Unit = z.enum(["offense", "defense", "st"]);
export type Unit = z.infer<typeof Unit>;

/** The 27 clickable slots on the drawn field: 11 personnel, 4-2-5 nickel, special teams. */
export const Slot = z.enum([
  "QB",
  "RB",
  "WR1",
  "WR2",
  "WR3",
  "TE",
  "LT",
  "LG",
  "C",
  "RG",
  "RT",
  "EDGE_L",
  "IDL_L",
  "IDL_R",
  "EDGE_R",
  "LB1",
  "LB2",
  "CB_L",
  "CB_R",
  "NB",
  "S1",
  "S2",
  "K",
  "P",
  "LS",
  "KR",
  "PR",
]);
export type Slot = z.infer<typeof Slot>;

/** League-wide comparison pools. OL is graded as a unit (32 teams); everything else per player. */
export const Pool = z.enum([
  "QB",
  "RB",
  "WR",
  "TE",
  "OL",
  "EDGE",
  "IDL",
  "LB",
  "CB",
  "S",
  "K",
  "P",
  "RET",
]);
export type Pool = z.infer<typeof Pool>;

export const WeekId = z.object({
  season: z.number().int().min(1999),
  week: z.number().int().min(1).max(22),
  /** nflverse game_id, e.g. "2026_03_NYJ_DET". */
  gameId: z.string().regex(/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/),
});
export type WeekId = z.infer<typeof WeekId>;
