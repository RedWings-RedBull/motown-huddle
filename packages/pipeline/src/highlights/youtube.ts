/**
 * Thin YouTube Data API v3 client: one `search.list` call restricted to a channel and a publish
 * window. The key travels only in the request's query string and is never logged.
 */
import type { FetchLike } from "../download.js";
import { ValidationError } from "../errors.js";
import type { VideoCandidate } from "./match.js";

export interface SearchOptions {
  apiKey: string;
  q: string;
  channelId: string;
  /** ISO datetimes. */
  publishedAfter: string;
  publishedBefore: string;
  maxResults?: number;
  fetch?: FetchLike;
}

interface SearchItem {
  id?: { videoId?: string };
  snippet?: { title?: string; channelId?: string; channelTitle?: string; publishedAt?: string };
}

export async function searchVideos(options: SearchOptions): Promise<VideoCandidate[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("order", "relevance");
  url.searchParams.set("maxResults", String(options.maxResults ?? 25));
  url.searchParams.set("q", options.q);
  url.searchParams.set("channelId", options.channelId);
  url.searchParams.set("publishedAfter", options.publishedAfter);
  url.searchParams.set("publishedBefore", options.publishedBefore);
  url.searchParams.set("key", options.apiKey);

  const doFetch = options.fetch ?? fetch;
  const res = await doFetch(url.toString());
  if (!res.ok) {
    // Never echo the URL: it carries the key.
    throw new ValidationError(`YouTube search failed: HTTP ${res.status} for "${options.q}"`);
  }
  const body = (await res.json()) as { items?: SearchItem[] };
  const out: VideoCandidate[] = [];
  for (const item of body.items ?? []) {
    const videoId = item.id?.videoId;
    const title = item.snippet?.title;
    if (!videoId || !title) continue;
    out.push({
      videoId,
      title: decodeEntities(title),
      channelId: item.snippet?.channelId ?? "",
      channel: item.snippet?.channelTitle ?? "",
      publishedAt: item.snippet?.publishedAt ?? null,
    });
  }
  return out;
}

/** search.list snippets come HTML-escaped ("Gibbs&#39; best plays"). */
export function decodeEntities(s: string): string {
  return s
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
