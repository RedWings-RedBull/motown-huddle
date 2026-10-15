import type { ArticleFrontmatter, ArticleType } from "@huddle/shared";
import { teamConfig } from "@huddle/shared";
import { type CollectionEntry, getCollection } from "astro:content";

export const ARTICLE_LABEL: Record<ArticleType, string> = {
  recap: "Game recap",
  division: teamConfig.division,
  preview: "Game preview",
};

/** Every article, newest first (by season, week, then publish time). */
export async function allArticles(): Promise<CollectionEntry<"articles">[]> {
  const entries = await getCollection("articles");
  return entries.sort(
    (a, b) =>
      b.data.season - a.data.season ||
      b.data.week - a.data.week ||
      b.data.publishedAt.localeCompare(a.data.publishedAt),
  );
}

export const articleHref = (entry: { id: string }) => `/articles/${entry.id}/`;

/** The newest article of one type, optionally for one season and week. */
export async function findArticle(
  type: ArticleType,
  where: { season?: number; week?: number } = {},
): Promise<CollectionEntry<"articles"> | undefined> {
  return (await allArticles()).find(
    (a) =>
      a.data.type === type &&
      (where.season === undefined || a.data.season === where.season) &&
      (where.week === undefined || a.data.week === where.week),
  );
}

const published = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "America/New_York",
});

export const publishedDate = (fm: Pick<ArticleFrontmatter, "publishedAt">) =>
  published.format(new Date(fm.publishedAt));
