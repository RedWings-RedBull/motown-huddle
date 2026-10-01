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
import { file, glob } from "astro/loaders";
// astro/zod re-exports the same zod 4 instance @huddle/shared is built with.
import type { ZodType } from "astro/zod";
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

export const collections = {
  games: week("game", GameSummary),
  teamMetrics: week("team-metrics", TeamMetrics),
  grades: week("grades", Grades),
  keyPlays: week("key-plays", KeyPlays),
  winProbability: week("win-probability", WinProbability),
  meta: week("meta", WeekMeta),
  baselines: week("league-baselines", LeagueBaselines),
  manifest: defineCollection({
    // The file loader wants an array or an id-keyed object; wrap the manifest under one id.
    loader: file("./src/data/manifest.json", {
      parser: (text) => ({ manifest: JSON.parse(text) as Record<string, unknown> }),
    }),
    schema: Manifest,
  }),
};
