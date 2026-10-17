/**
 * The newest game in the committed data, so tests about "the latest game" keep passing when the
 * weekly bot adds a week. Fixed-week tests (the Week 3 breakdown) pin their own data instead.
 */
import { readFileSync } from "node:fs";

import { gameHref, resultWord, teamScores, venueWord, weekId } from "../src/lib/week";

interface ManifestWeek {
  season: number;
  week: number;
}
interface GameFile {
  team: { opponent: string; result: "W" | "L" | "T"; side: "home" | "away" };
  home: { score: number };
  away: { score: number };
}

const dataUrl = (path: string) => new URL(`../src/data/${path}`, import.meta.url);
const readJson = (path: string): unknown => JSON.parse(readFileSync(dataUrl(path), "utf8"));

const weeks = (readJson("manifest.json") as { weeks: ManifestWeek[] }).weeks;
const newest = [...weeks].sort((a, b) => b.season - a.season || b.week - a.week)[0];
if (!newest) throw new Error("manifest.json lists no weeks");

const game = readJson(`${weekId(newest.season, newest.week)}/game.json`) as GameFile;

export const latest = {
  /** e.g. "Win vs NYJ" or "Loss at CAR". */
  headline: `${resultWord(game.team.result)} ${venueWord(game.team.side)} ${game.team.opponent}`,
  ...teamScores(game),
  /** Path of the game breakdown, e.g. /games/2026/week-04/. */
  path: gameHref(newest.season, newest.week),
};
