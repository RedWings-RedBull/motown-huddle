import {
  ArticleFrontmatter,
  GameSummary,
  GameHighlights,
  Grades,
  KeyPlays,
  LeagueBaselines,
  CoachFile,
  DivisionFile,
  Manifest,
  QuotesFile,
  MatchupPreview,
  RosterFile,
  SocialsFile,
  TeamMetrics,
  WeekMeta,
  WinProbability,
} from "@huddle/shared";
import { file, glob } from "astro/loaders";
// astro/zod re-exports the same zod 4 instance @huddle/shared is built with.
import { type ZodType, z } from "astro/zod";
import { defineCollection } from "astro:content";

/**
 * Every weekly artifact the pipeline writes under src/data/<season>/week-<nn>/ becomes one
 * collection, validated at build time by the same zod 4 schema the pipeline validated it with.
 * Entry ids are "<season>/week-<nn>" so the seven collections line up on the same key.
 */
function week<S extends ZodType>(name: string, schema: S) {
  return defineCollection({
    loader: glob({
      pattern: `*/week-*/${name}.json`,
      base: "./src/data",
      generateId: ({ entry }) => entry.replace(/\/[^/]+\.json$/, ""),
    }),
    schema,
  });
}

type Json = Record<string, unknown>;

/**
 * One JSON file as a single-entry collection. The file loader wants an array or an id-keyed
 * object, so the parsed document is wrapped under `id`.
 */
function single<S extends ZodType>(
  path: string,
  id: string,
  schema: S,
  wrap: (data: Json) => Json = (data) => data,
) {
  return defineCollection({
    loader: file(path, { parser: (text) => ({ [id]: wrap(JSON.parse(text) as Json) }) }),
    schema,
  });
}

export const collections = {
  articles: defineCollection({
    loader: glob({ pattern: "**/*.md", base: "./src/content/articles" }),
    schema: ArticleFrontmatter,
  }),
  games: week("game", GameSummary),
  teamMetrics: week("team-metrics", TeamMetrics),
  grades: week("grades", Grades),
  keyPlays: week("key-plays", KeyPlays),
  gameHighlights: week("game-highlights", GameHighlights),
  winProbability: week("win-probability", WinProbability),
  meta: week("meta", WeekMeta),
  baselines: week("league-baselines", LeagueBaselines),
  coach: single("./src/data/coach/current.json", "current", CoachFile),
  quotes: single("./src/data/coach/quotes.json", "quotes", QuotesFile),
  division: single("./src/data/division/current.json", "current", DivisionFile),
  preview: single("./src/data/preview/next.json", "next", MatchupPreview),
  roster: single("./src/data/roster/current.json", "current", RosterFile),
  socials: single(
    "./src/data/players_socials.json",
    "socials",
    z.object({ entries: SocialsFile }),
    (entries) => ({ entries }),
  ),
  manifest: single("./src/data/manifest.json", "manifest", Manifest),
};
