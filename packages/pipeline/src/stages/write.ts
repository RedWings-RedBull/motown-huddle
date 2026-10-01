import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ZodType } from "zod";

import {
  GameSummary,
  Grades,
  KeyPlays,
  LeagueBaselines,
  Manifest,
  TeamMetrics,
  WeekMeta,
  WinProbability,
} from "@huddle/shared";

import { ValidationError } from "../errors.js";

const ROUND_DP = 3;

/** Rounds non-integer numbers to 3 dp; integers, strings, booleans and null pass through. */
export function roundValue(value: unknown): unknown {
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value;
    const rounded = Number(value.toFixed(ROUND_DP));
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  if (Array.isArray(value)) return value.map(roundValue);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = roundValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Deterministic JSON: sorted keys at every level, 3-dp rounding, trailing newline, no timestamps. */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(roundValue(value), null, 2)}\n`;
}

export function weekDirName(week: number): string {
  return `week-${String(week).padStart(2, "0")}`;
}

export interface WeekArtifacts {
  game: GameSummary;
  teamMetrics: TeamMetrics;
  grades: Grades;
  keyPlays: KeyPlays;
  winProbability: WinProbability;
  meta: WeekMeta;
  leagueBaselines: LeagueBaselines;
}

const FILES: { [K in keyof WeekArtifacts]: { file: string; schema: ZodType } } = {
  game: { file: "game.json", schema: GameSummary },
  teamMetrics: { file: "team-metrics.json", schema: TeamMetrics },
  grades: { file: "grades.json", schema: Grades },
  keyPlays: { file: "key-plays.json", schema: KeyPlays },
  winProbability: { file: "win-probability.json", schema: WinProbability },
  meta: { file: "meta.json", schema: WeekMeta },
  leagueBaselines: { file: "league-baselines.json", schema: LeagueBaselines },
};

/** Validates every artifact against the shared contract after rounding; throws ValidationError. */
export function validateArtifacts(artifacts: WeekArtifacts): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(FILES) as (keyof WeekArtifacts)[]) {
    const { file, schema } = FILES[key];
    const text = stableJson(artifacts[key]);
    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue ? `${issue.path.join(".")}: ${issue.message}` : "unknown";
      throw new ValidationError(`${file} failed validation: ${where}`);
    }
    out[file] = text;
  }
  return out;
}

/** Writes the week's files under <dataDir>/<season>/week-<nn>/ and returns the paths written. */
export async function writeWeek(
  dataDir: string,
  season: number,
  week: number,
  artifacts: WeekArtifacts,
): Promise<string[]> {
  const files = validateArtifacts(artifacts);
  const dir = join(dataDir, String(season), weekDirName(week));
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  for (const [file, text] of Object.entries(files)) {
    const path = join(dir, file);
    await writeFile(path, text);
    written.push(path);
  }
  return written;
}

/** Rebuilds manifest.json from every game.json under the data directory. */
export async function rebuildManifest(dataDir: string): Promise<Manifest> {
  const weeks: Manifest["weeks"] = [];
  for (const seasonDir of await listDirs(dataDir)) {
    if (!/^\d{4}$/.test(seasonDir)) continue;
    for (const weekDir of await listDirs(join(dataDir, seasonDir))) {
      if (!/^week-\d{2}$/.test(weekDir)) continue;
      const path = join(dataDir, seasonDir, weekDir, "game.json");
      let raw: string;
      try {
        raw = await readFile(path, "utf8");
      } catch {
        continue;
      }
      const game = GameSummary.parse(JSON.parse(raw));
      weeks.push({
        season: game.season,
        week: game.week,
        gameId: game.gameId,
        tier: game.tier,
        opponent: game.team.opponent,
        result: game.team.result,
      });
    }
  }
  weeks.sort((a, b) => a.season - b.season || a.week - b.week);
  const manifest = Manifest.parse({ weeks });
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, "manifest.json"), stableJson(manifest));
  return manifest;
}

async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}
