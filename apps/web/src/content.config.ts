import {
  GameSummary,
  Grades,
  KeyPlays,
  LeagueBaselines,
  Manifest,
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

export const collections = {
  games: week("game", GameSummary),
  teamMetrics: week("team-metrics", TeamMetrics),
  grades: week("grades", Grades),
  keyPlays: week("key-plays", KeyPlays),
  winProbability: week("win-probability", WinProbability),
  meta: week("meta", WeekMeta),
  baselines: week("league-baselines", LeagueBaselines),
  preview: defineCollection({
    loader: file("./src/data/preview/next.json", {
      parser: (text) => ({ next: JSON.parse(text) as Record<string, unknown> }),
    }),
    schema: MatchupPreview,
  }),
  roster: defineCollection({
    loader: file("./src/data/roster/current.json", {
      parser: (text) => ({ current: JSON.parse(text) as Record<string, unknown> }),
    }),
    schema: RosterFile,
  }),
  socials: defineCollection({
    loader: file("./src/data/players_socials.json", {
      parser: (text) => ({ socials: { entries: JSON.parse(text) as Record<string, unknown> } }),
    }),
    schema: z.object({ entries: SocialsFile }),
  }),
  manifest: defineCollection({
    // The file loader wants an array or an id-keyed object; wrap the manifest under one id.
    loader: file("./src/data/manifest.json", {
      parser: (text) => ({ manifest: JSON.parse(text) as Record<string, unknown> }),
    }),
    schema: Manifest,
  }),
};
