/**
 * The data an article may use, and nothing else. Each bundle is a compact JSON view of files the
 * pipeline already wrote under apps/web/src/data; the model sees only this, and the grounding check
 * accepts only numbers, names and plays that appear in it.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type ArticleType,
  DivisionFile,
  GameSummary,
  Grades,
  KeyPlays,
  Manifest,
  MatchupPreview,
  TeamMetrics,
  teamConfig,
  teamName,
} from "@huddle/shared";
import type { z } from "zod";

interface BundlePlay {
  id: number;
  qtr: number;
  clock: string;
  team: string;
  desc: string;
  epa: number;
  wpa: number;
  tags: string[];
}

export interface Bundle {
  type: ArticleType;
  season: number;
  week: number;
  gameId: string | null;
  /** Where play tags link to; null when the article has no plays. */
  gamePath: string | null;
  /** Everything the article may state, as plain JSON. */
  facts: Record<string, unknown>;
  plays: BundlePlay[];
  /** Full names the article may use as written. */
  people: string[];
}

const readData = <S extends z.ZodType>(dataDir: string, path: string, schema: S): z.infer<S> =>
  schema.parse(JSON.parse(readFileSync(join(dataDir, path), "utf8")));

const weekSlug = (week: number) => `week-${String(week).padStart(2, "0")}`;

/** The newest built week in the manifest. */
export function latestWeek(dataDir: string): { season: number; week: number } {
  const weeks = readData(dataDir, "manifest.json", Manifest).weeks;
  const newest = [...weeks].sort((a, b) => b.season - a.season || b.week - a.week)[0];
  if (!newest) throw new Error("manifest.json lists no weeks; build a week first");
  return { season: newest.season, week: newest.week };
}

const pct = (x: number) => Math.round(x * 1000) / 10;

const easternFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short",
});

/** Kickoff as readers see it, e.g. "Sun, Oct 11, 2026, 4:25 PM EDT"; the model never sees UTC. */
const eastern = (iso: string) => easternFormat.format(new Date(iso));

/**
 * The schedule's spread is from the home side (positive: home favoured). Spelled out so the model
 * cannot misread who was favoured.
 */
function pregameLine(
  line: { spread: number | null; total: number | null },
  side: "home" | "away",
  team: string,
  opponent: string,
): { favorite: string | null; favoredByPoints: number | null; overUnderTotal: number | null } {
  if (line.spread === null || line.spread === 0) {
    return { favorite: null, favoredByPoints: null, overUnderTotal: line.total };
  }
  const homeFavored = line.spread > 0;
  const home = side === "home" ? team : opponent;
  const away = side === "home" ? opponent : team;
  return {
    favorite: teamName(homeFavored ? home : away),
    favoredByPoints: Math.abs(line.spread),
    overUnderTotal: line.total,
  };
}

function recapBundle(dataDir: string, season: number, week: number): Bundle {
  const dir = `${String(season)}/${weekSlug(week)}`;
  const game = readData(dataDir, `${dir}/game.json`, GameSummary);
  const metrics = readData(dataDir, `${dir}/team-metrics.json`, TeamMetrics);
  const grades = readData(dataDir, `${dir}/grades.json`, Grades);
  const keyPlays = readData(dataDir, `${dir}/key-plays.json`, KeyPlays);
  const team = teamConfig.team;
  const opponent = game.team.opponent;

  const players = grades.slots
    .flatMap((s) =>
      s.players.map((p) => ({
        name: p.name,
        position: p.position,
        slot: s.label,
        snaps: p.snaps,
        huddleGrade: p.grade.value,
      })),
    )
    .filter((p) => p.huddleGrade !== null);
  const graded = [...players].sort((a, b) => (b.huddleGrade ?? 0) - (a.huddleGrade ?? 0));

  const side = (m: (typeof metrics)["team"]) => ({
    epaPerPlay: m.epaPerPlay.value,
    successRatePct: pct(m.successRate.value),
    passEpaPerDropback: m.passEpaPerDropback.value,
    rushEpaPerAttempt: m.rushEpaPerAtt.value,
    explosiveRatePct: pct(m.explosiveRate.value),
    sackRatePct: pct(m.sackRate.value),
    thirdDownRatePct: pct(m.thirdDownRate.value),
    fourthDowns: m.fourthDown,
    turnovers: m.turnovers,
    penalties: m.penalties,
  });

  return {
    type: "recap",
    season,
    week,
    gameId: game.gameId,
    gamePath: `/games/${String(season)}/${weekSlug(week)}/`,
    facts: {
      team: teamName(team),
      opponent: teamName(opponent),
      result: game.team.result,
      venue: game.team.side === "home" ? "home" : "away",
      score: {
        [team]: game.team.side === "home" ? game.home.score : game.away.score,
        [opponent]: game.team.side === "home" ? game.away.score : game.home.score,
      },
      overtime: game.overtime,
      stadium: game.venue.stadium,
      kickoff: eastern(game.kickoffUtc),
      line: pregameLine(game.line, game.team.side, team, opponent),
      gradesTier: grades.tier,
      teamGrade: metrics.teamGrade,
      offense: { [team]: side(metrics.team), [opponent]: side(metrics.opponent) },
      topGraded: graded.slice(0, 8),
      lowestGraded: graded.slice(-5).reverse(),
    },
    plays: keyPlays.plays.map((p) => ({
      id: p.playId,
      qtr: p.qtr,
      clock: p.clock,
      team: p.posteam,
      desc: p.desc,
      epa: p.epa,
      wpa: p.wpa,
      tags: p.tags,
    })),
    people: graded.map((p) => p.name),
  };
}

function divisionBundle(dataDir: string, season: number, week: number): Bundle {
  const d = readData(dataDir, "division/current.json", DivisionFile);
  return {
    type: "division",
    season,
    week,
    gameId: null,
    gamePath: null,
    facts: {
      division: d.division,
      throughWeek: d.throughWeek,
      standings: d.standings.map((s) => ({
        team: teamName(s.team),
        rank: s.rank,
        record: `${String(s.w)}-${String(s.l)}${s.t ? `-${String(s.t)}` : ""}`,
        divisionRecord: `${String(s.division.w)}-${String(s.division.l)}`,
        pointsFor: s.pointsFor,
        pointsAgainst: s.pointsAgainst,
        pointDiff: s.pointsFor - s.pointsAgainst,
        streak: s.streak,
        tiebreaker: s.resolvedBy,
      })),
      odds: d.odds.map((o) => ({
        team: teamName(o.team),
        divisionPct: pct(o.division),
        playoffsPct: pct(o.playoffs),
        expectedWins: Math.round(o.expectedWins * 10) / 10,
      })),
      simulationRuns: d.simulation.runs,
      efficiency: d.profiles.map((p) => ({
        team: teamName(p.team),
        offenseEpaPerPlay: p.offense.epaPerPlay.value,
        offenseRank: p.offense.epaPerPlay.leagueRank,
        defenseEpaPerPlay: p.defense.epaPerPlay.value,
        defenseRank: p.defense.epaPerPlay.leagueRank,
      })),
      upcoming: d.upcoming.map((u) => ({
        away: teamName(u.away),
        home: teamName(u.home),
        kickoff: eastern(u.kickoffUtc),
        divisionGame: u.divGame,
        line: pregameLine({ spread: u.spread, total: null }, "home", u.home, u.away),
      })),
    },
    plays: [],
    people: [],
  };
}

function previewBundle(dataDir: string, season: number): Bundle {
  const p = readData(dataDir, "preview/next.json", MatchupPreview);
  const team = teamConfig.team;
  const profile = (t: typeof p.team) => ({
    record: `${String(t.record.w)}-${String(t.record.l)}${t.record.t ? `-${String(t.record.t)}` : ""}`,
    offense: {
      epaPerPlay: t.offense.epaPerPlay.value,
      epaRank: t.offense.epaPerPlay.leagueRank,
      successRatePct: pct(t.offense.successRate.value),
      passEpaRank: t.offense.passEpaPerDropback.leagueRank,
      rushEpaRank: t.offense.rushEpaPerAtt.leagueRank,
    },
    defense: {
      epaPerPlayAllowed: t.defense.epaPerPlay.value,
      epaRank: t.defense.epaPerPlay.leagueRank,
      passEpaRank: t.defense.passEpaPerDropback.leagueRank,
      rushEpaRank: t.defense.rushEpaPerAtt.leagueRank,
    },
  });
  const people = [
    p.quarterbacks.team,
    p.quarterbacks.opponent,
    p.coaches.team,
    p.coaches.opponent,
    ...p.injuries.map((i) => i.name),
  ].filter((n): n is string => typeof n === "string" && n.length > 0);
  return {
    type: "preview",
    season,
    week: p.week,
    gameId: p.gameId,
    gamePath: null,
    facts: {
      team: teamName(team),
      opponent: teamName(p.opponent),
      venue: p.isHome ? "home" : "away",
      kickoff: eastern(p.kickoffUtc),
      stadium: p.venue.stadium,
      roof: p.venue.roof,
      // The preview stores the spread from the team's side in betting notation (negative: team
      // favoured); convert back to the schedule's home-side convention for pregameLine.
      line: pregameLine(
        {
          spread: p.line.spread === null ? null : p.isHome ? -p.line.spread : p.line.spread,
          total: p.line.total,
        },
        p.isHome ? "home" : "away",
        team,
        p.opponent,
      ),
      restDays: p.rest,
      quarterbacks: p.quarterbacks,
      coaches: p.coaches,
      statsThroughWeek: p.throughWeek,
      [team]: profile(p.team),
      [p.opponent]: profile(p.opp),
      keyMatchups: p.keyMatchups,
      injuries: p.injuries.map((i) => ({
        team: i.team,
        name: i.name,
        position: i.position,
        status: i.reportStatus,
        injury: i.primary,
        practice: i.practiceStatus,
      })),
      lastMeetings: p.lastMeetings,
    },
    plays: [],
    people,
  };
}

export function buildBundle(
  type: ArticleType,
  dataDir: string,
  season: number,
  week: number,
): Bundle {
  if (type === "recap") return recapBundle(dataDir, season, week);
  if (type === "division") return divisionBundle(dataDir, season, week);
  return previewBundle(dataDir, season);
}

/** Bump when prompts or the checker change in a way that should rewrite existing articles. */
const PROMPT_VERSION = "2";

export function bundleHash(bundle: Bundle): string {
  return createHash("sha256")
    .update(PROMPT_VERSION)
    .update(JSON.stringify(bundle))
    .digest("hex")
    .slice(0, 16);
}
