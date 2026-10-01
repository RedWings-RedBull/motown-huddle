import { z } from "zod";

/**
 * One row schema per nflverse file, listing only the columns the pipeline reads. Column names were
 * verified against the live 2026 headers on 2026-09-30; a rename upstream fails at parse time with
 * the missing column named, instead of silently producing zeros.
 *
 * Every numeric column goes through `na()`: nflverse writes "NA" (R) or "" for missing values.
 */

/** "NA" / "" -> null, otherwise a finite number. */
export const na = () =>
  z.preprocess(
    (v) => (v === "NA" || v === "" || v === undefined ? null : v),
    z.coerce.number().nullable(),
  );

/** Like na() but the value must be present. */
const num = () => z.coerce.number();

/** "TRUE"/"FALSE"/"1"/"0" -> boolean, "NA"/"" -> null. */
export const bool = () =>
  z.preprocess((v) => {
    if (v === "NA" || v === "" || v === undefined) return null;
    if (v === "TRUE" || v === "true" || v === "1") return true;
    if (v === "FALSE" || v === "false" || v === "0") return false;
    return v;
  }, z.boolean().nullable());

/** Free text where "NA"/"" mean null. */
export const str = () =>
  z.preprocess((v) => (v === "NA" || v === "" ? null : v), z.string().nullable());

const text = () => z.string();

export const PbpRow = z.object({
  play_id: num(),
  game_id: text(),
  season: num(),
  season_type: str(),
  week: num(),
  home_team: text(),
  away_team: text(),
  posteam: str(),
  defteam: str(),
  qtr: na(),
  time: str(),
  game_seconds_remaining: na(),
  desc: str(),
  down: na(),
  ydstogo: na(),
  yardline_100: na(),
  play_type: str(),
  epa: na(),
  qb_epa: na(),
  wp: na(),
  vegas_wp: na(),
  wpa: na(),
  score_differential: na(),
  success: na(),
  cp: na(),
  cpoe: na(),
  complete_pass: na(),
  pass_attempt: na(),
  rush_attempt: na(),
  qb_dropback: na(),
  qb_scramble: na(),
  qb_kneel: na(),
  sack: na(),
  qb_hit: na(),
  yards_gained: na(),
  penalty: na(),
  penalty_team: str(),
  penalty_player_id: str(),
  penalty_type: str(),
  penalty_yards: na(),
  passer_player_id: str(),
  rusher_player_id: str(),
  receiver_player_id: str(),
  interception: na(),
  interception_player_id: str(),
  fumble_lost: na(),
  fumbled_1_player_id: str(),
  touchdown: na(),
  safety: na(),
  field_goal_attempt: na(),
  field_goal_result: str(),
  kick_distance: na(),
  extra_point_attempt: na(),
  extra_point_result: str(),
  punt_attempt: na(),
  kickoff_attempt: na(),
  touchback: na(),
  punt_fair_catch: na(),
  kickoff_fair_catch: na(),
  kicker_player_id: str(),
  punter_player_id: str(),
  run_location: str(),
  run_gap: str(),
  yac_epa: na(),
  xyac_epa: na(),
  solo_tackle_1_player_id: str(),
  solo_tackle_2_player_id: str(),
  assist_tackle_1_player_id: str(),
  assist_tackle_2_player_id: str(),
  assist_tackle_3_player_id: str(),
  assist_tackle_4_player_id: str(),
  tackle_with_assist_1_player_id: str(),
  tackle_with_assist_2_player_id: str(),
  pass_defense_1_player_id: str(),
  pass_defense_2_player_id: str(),
  punt_returner_player_id: str(),
  kickoff_returner_player_id: str(),
  return_yards: na(),
  third_down_converted: na(),
  third_down_failed: na(),
  fourth_down_converted: na(),
  fourth_down_failed: na(),
  special_teams_play: na(),
  total_home_score: na(),
  total_away_score: na(),
  roof: str(),
});
export type PbpRow = z.infer<typeof PbpRow>;

export const StatsPlayerRow = z.object({
  player_id: text(),
  player_display_name: text(),
  position: str(),
  position_group: str(),
  team: text(),
  opponent_team: str(),
  season: num(),
  week: num(),
  game_id: str(),
  completions: na(),
  attempts: na(),
  passing_epa: na(),
  passing_cpoe: na(),
  sacks_suffered: na(),
  carries: na(),
  rushing_epa: na(),
  targets: na(),
  receptions: na(),
  receiving_yards: na(),
  receiving_epa: na(),
  target_share: na(),
  def_tackles_solo: na(),
  def_tackle_assists: na(),
  def_tackles_for_loss: na(),
  def_sacks: na(),
  def_qb_hits: na(),
  def_interceptions: na(),
  def_pass_defended: na(),
  fg_made: na(),
  fg_att: na(),
  pat_made: na(),
  pat_att: na(),
  pt_att: na(),
  pt_net_yards: na(),
  pt_inside_20: na(),
  penalties: na(),
  penalty_yards: na(),
});
export type StatsPlayerRow = z.infer<typeof StatsPlayerRow>;

export const SnapCountRow = z.object({
  game_id: text(),
  season: num(),
  week: num(),
  player: text(),
  pfr_player_id: text(),
  position: text(),
  team: text(),
  opponent: text(),
  offense_snaps: na(),
  offense_pct: na(),
  defense_snaps: na(),
  defense_pct: na(),
  st_snaps: na(),
  st_pct: na(),
});
export type SnapCountRow = z.infer<typeof SnapCountRow>;

export const FtnRow = z.object({
  nflverse_game_id: text(),
  nflverse_play_id: num(),
  season: num(),
  week: num(),
  is_qb_fault_sack: bool(),
  is_interception_worthy: bool(),
  is_drop: bool(),
  is_catchable_ball: bool(),
  is_contested_ball: bool(),
  is_created_reception: bool(),
  n_pass_rushers: na(),
  n_blitzers: na(),
});
export type FtnRow = z.infer<typeof FtnRow>;

const pfrKeys = {
  game_id: text(),
  season: num(),
  week: num(),
  team: text(),
  opponent: str(),
  pfr_player_name: text(),
  pfr_player_id: text(),
};

export const PfrPassRow = z.object({
  ...pfrKeys,
  times_pressured: na(),
  times_pressured_pct: na(),
  times_blitzed: na(),
  times_hurried: na(),
  times_hit: na(),
  passing_bad_throw_pct: na(),
});
export type PfrPassRow = z.infer<typeof PfrPassRow>;

export const PfrRushRow = z.object({
  ...pfrKeys,
  carries: na(),
  rushing_yards_before_contact: na(),
  rushing_yards_after_contact_avg: na(),
  rushing_broken_tackles: na(),
});
export type PfrRushRow = z.infer<typeof PfrRushRow>;

export const PfrRecRow = z.object({
  ...pfrKeys,
  receiving_drop: na(),
  receiving_drop_pct: na(),
  receiving_broken_tackles: na(),
});
export type PfrRecRow = z.infer<typeof PfrRecRow>;

export const PfrDefRow = z.object({
  ...pfrKeys,
  def_ints: na(),
  def_targets: na(),
  def_completions_allowed: na(),
  def_completion_pct: na(),
  def_yards_allowed: na(),
  def_yards_allowed_per_tgt: na(),
  def_receiving_td_allowed: na(),
  def_passer_rating_allowed: na(),
  def_times_blitzed: na(),
  def_pressures: na(),
  def_missed_tackles: na(),
  def_missed_tackle_pct: na(),
});
export type PfrDefRow = z.infer<typeof PfrDefRow>;

/** 2025+ format: daily snapshots keyed by `dt`, slot positions in `pos_abb`. */
export const DepthChartRow = z.object({
  dt: text(),
  team: text(),
  player_name: text(),
  gsis_id: str(),
  pos_grp: text(),
  pos_abb: text(),
  pos_rank: num(),
});
export type DepthChartRow = z.infer<typeof DepthChartRow>;

export const PlayersRow = z.object({
  gsis_id: str(),
  display_name: text(),
  pfr_id: str(),
  espn_id: str(),
  position: str(),
  position_group: str(),
  ngs_position: str(),
  jersey_number: na(),
  latest_team: str(),
  status: str(),
});
export type PlayersRow = z.infer<typeof PlayersRow>;

export const GamesRow = z.object({
  game_id: text(),
  season: num(),
  game_type: text(),
  week: num(),
  gameday: text(),
  gametime: z.string(),
  away_team: text(),
  home_team: text(),
  away_score: na(),
  home_score: na(),
  result: na(),
  total: na(),
  overtime: na(),
  spread_line: na(),
  total_line: na(),
  roof: str(),
  surface: str(),
  temp: na(),
  wind: na(),
  stadium: str(),
  away_rest: na(),
  home_rest: na(),
  div_game: na(),
  away_qb_name: str(),
  home_qb_name: str(),
  away_coach: str(),
  home_coach: str(),
  referee: str(),
});
export type GamesRow = z.infer<typeof GamesRow>;

const ngsKeys = {
  season: num(),
  season_type: text(),
  week: num(),
  player_gsis_id: text(),
  team_abbr: text(),
};

export const NgsPassingRow = z.object({
  ...ngsKeys,
  attempts: na(),
  completion_percentage_above_expectation: na(),
});
export type NgsPassingRow = z.infer<typeof NgsPassingRow>;

export const NgsRushingRow = z.object({
  ...ngsKeys,
  rush_attempts: na(),
  rush_yards_over_expected_per_att: na(),
});
export type NgsRushingRow = z.infer<typeof NgsRushingRow>;

export const NgsReceivingRow = z.object({
  ...ngsKeys,
  targets: na(),
  avg_yac_above_expectation: na(),
});
export type NgsReceivingRow = z.infer<typeof NgsReceivingRow>;

/** Row filters applied in-stream so a season file collapses to the requested week. */
export const forWeek =
  (season: number, week: number) =>
  (row: Record<string, string>): boolean =>
    row.season === String(season) && row.week === String(week);

export const forSeason =
  (season: number) =>
  (row: Record<string, string>): boolean =>
    row.season === String(season);

/** weekly_rosters/roster_weekly_<season>.csv (header verified 2026-10-01). */
export const WeeklyRosterRow = z.object({
  season: num(),
  team: text(),
  position: text(),
  depth_chart_position: str(),
  jersey_number: na(),
  status: text(),
  full_name: text(),
  first_name: text(),
  last_name: text(),
  birth_date: str(),
  height: na(),
  weight: na(),
  college: str(),
  gsis_id: str(),
  espn_id: str(),
  pfr_id: str(),
  years_exp: na(),
  ngs_position: str(),
  week: num(),
  game_type: text(),
  rookie_year: na(),
  draft_club: str(),
  draft_number: na(),
});
export type WeeklyRosterRow = z.infer<typeof WeeklyRosterRow>;

/** injuries/injuries_<season>.csv (header verified 2026-10-01). */
export const InjuryRow = z.object({
  season: num(),
  team: text(),
  week: num(),
  gsis_id: str(),
  full_name: str(),
  position: str(),
  report_primary_injury: str(),
  report_status: str(),
  practice_status: str(),
});
export type InjuryRow = z.infer<typeof InjuryRow>;
