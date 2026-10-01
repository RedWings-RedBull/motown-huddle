import type { Component, Source } from "@huddle/shared";

/**
 * Formatting shared by the build-time panels and the client island. Keep it dependency-free:
 * it ships to the browser inside the field heat map bundle.
 */

export function formatGrade(value: number | null): string {
  return value === null ? "–" : String(Math.round(value));
}

export function formatPct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatSigned(value: number, digits: number): string {
  const fixed = value.toFixed(digits);
  return value > 0 ? `+${fixed}` : fixed;
}

/** Renders a component's raw value with the unit's natural precision. */
export function formatComponentValue(unit: Component["unit"], value: number | null): string {
  if (value === null) return "–";
  switch (unit) {
    case "pct":
      // Rates are stored as fractions; PFR percentages arrive already scaled 0-100.
      return Math.abs(value) <= 1 ? formatPct(value) : `${value.toFixed(1)}%`;
    case "rate":
      return formatPct(value);
    case "epa":
      return formatSigned(value, 2);
    case "yds":
      return formatSigned(value, 1);
    case "count":
      return Number.isInteger(value) ? String(value) : value.toFixed(1);
    case "score":
      return value.toFixed(1);
  }
}

export const SOURCE_LABEL: Record<Source, string> = {
  pbp: "pbp",
  stats_player: "stats",
  snap_counts: "snaps",
  ftn: "FTN",
  ngs: "NGS",
  pfr: "PFR",
  games: "sched",
};

export const SOURCE_TITLE: Record<Source, string> = {
  pbp: "nflverse play-by-play",
  stats_player: "nflverse weekly player stats",
  snap_counts: "nflverse snap counts",
  ftn: "FTN Data via nflverse",
  ngs: "NFL Next Gen Stats via nflverse",
  pfr: "Pro-Football-Reference via nflverse",
  games: "nflverse schedule",
};

/** PFR advanced stats lag the game by days, so every PFR component belongs to the Final tier. */
export function tierForSource(source: Source): "provisional" | "final" {
  return source === "pfr" ? "final" : "provisional";
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Formats one numeric metric for display. */
export type Formatter = (value: number) => string;
