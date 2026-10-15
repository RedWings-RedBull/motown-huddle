import { z } from "zod";

/** Recap of the latest game, the division after that week, and the preview of the next game. */
export const ArticleType = z.enum(["recap", "division", "preview"]);
export type ArticleType = z.infer<typeof ArticleType>;

/** Frontmatter of every generated article under apps/web/src/content/articles. */
export const ArticleFrontmatter = z
  .object({
    title: z.string().min(10).max(110),
    description: z.string().min(40).max(200),
    type: ArticleType,
    season: z.number().int(),
    /** The week the article is about: the game's week for recap and division, the next game's for preview. */
    week: z.number().int().min(1).max(22),
    gameId: z.string().nullable(),
    publishedAt: z.iso.datetime(),
    /** Model alias and effort the article was drafted with. */
    model: z.string().min(1),
    effort: z.string().min(1),
    /** Hash of the data bundle and prompt version; an unchanged hash means no rewrite is needed. */
    dataHash: z.string().regex(/^[0-9a-f]{16}$/),
    /** What the deterministic checker verified before the article was allowed to exist. */
    grounding: z
      .object({
        numbers: z.number().int().min(0),
        names: z.number().int().min(0),
        plays: z.number().int().min(0),
        passed: z.literal(true),
      })
      .strict(),
  })
  .strict();
export type ArticleFrontmatter = z.infer<typeof ArticleFrontmatter>;
