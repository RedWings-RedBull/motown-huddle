import { describe, expect, it } from "vitest";

import {
  isGameHighlights,
  NFL_CHANNEL_ID,
  pickGameHighlights,
  searchQuery,
  searchUrl,
  type VideoCandidate,
} from "../src/highlights/match.js";
import { decodeEntities, searchVideos } from "../src/highlights/youtube.js";

const nfl = (
  videoId: string,
  title: string,
  publishedAt = "2026-09-27T20:00:00Z",
): VideoCandidate => ({
  videoId,
  title,
  channelId: NFL_CHANNEL_ID,
  channel: "NFL",
  publishedAt,
});
const other = (videoId: string, title: string, channel: string): VideoCandidate => ({
  videoId,
  title,
  channelId: `UC-not-the-league-${channel}`,
  channel,
  publishedAt: "2026-09-27T20:00:00Z",
});

/**
 * Real titles from YouTube for the 2026 season, weeks 1 to 3, as listed on the league's channel and
 * in search results on 2026-10-01. Near misses (previews, other games, other weeks, the club's own
 * channel, foreign-language uploads) are included on purpose.
 */
const POOL: VideoCandidate[] = [
  nfl(
    "KC4OW2m3hjs",
    "New Orleans Saints vs. Detroit Lions Game Highlights | NFL 2026 Season Week 1",
  ),
  nfl("ULjOfKcZl4o", "Detroit Lions vs Buffalo Bills Game Highlights | 2026 NFL Season Week 2"),
  nfl("xsJzYyK4mGE", "New York Jets vs. Detroit Lions Game Highlights | NFL 2026 Season Week 3"),
  nfl("GSZ0Bax9eeA", "Jets VS Lions down to the wire ending!"),
  nfl("qahjjvrG2kI", "New York Jets vs Detroit Lions Game Preview | 2026 Week 3"),
  nfl("jQ8n2yvxo0w", "Detroit Lions vs Carolina Panthers | 2026 Week 4 Game Preview"),
  nfl("vt9DKUJ_Q-Y", "New York Jets vs Tennessee Titans Game Highlights | NFL 2026 Week 1"),
  nfl(
    "Z7OIS7hXV7E",
    "Green Bay Packers vs. New York Jets Game Highlights | NFL 2026 Season Week 2",
  ),
  nfl(
    "v__pg6qIYL4",
    "Los Angeles Chargers vs. Buffalo Bills Game Highlights | NFL 2026 Season Week 3",
  ),
  nfl(
    "eyM7QUODW6c",
    "Kansas City Chiefs vs. Miami Dolphins Game Highlights | NFL 2026 Season Week 3",
  ),
  nfl("kiD9Ub6LUGg", "Best Plays From Sunday! 2026 NFL Season Week 3"),
  nfl("zXihZSqnEP0", "Every Touchdown of Week 3 | 2026 NFL Season"),
  nfl("627FVmkXsbE", "Jahmyr Gibbs' best plays from 3-TD game | Week 3"),
  other("Iy8saaW8rBY", "2026 Week 3: Lions vs. Jets | Highlights 🎥", "Detroit Lions"),
  other(
    "5xorNfjKn9w",
    "NFL Highlights | New York Jets @ Detroit Lions | Week 3 | Sky Sport NFL",
    "Sky Sport DE",
  ),
  other(
    "ijqsu4vKDhQ",
    "New York Jets vs. Detroit Lions | Semana 3 - Temporada NFL 2026 | Resumen en español",
    "Mundo NFL",
  ),
];

describe("backtest on real 2026 titles", () => {
  it.each([
    { week: 1, home: "DET", away: "NO", expected: "KC4OW2m3hjs" },
    { week: 2, home: "BUF", away: "DET", expected: "ULjOfKcZl4o" },
    { week: 3, home: "DET", away: "NYJ", expected: "xsJzYyK4mGE" },
  ])("week $week picks the league's package and nothing else", ({ week, home, away, expected }) => {
    expect(pickGameHighlights(POOL, home, away, week)?.videoId).toBe(expected);
    const accepted = POOL.filter((v) => isGameHighlights(v, home, away, week));
    expect(accepted.map((v) => v.videoId)).toEqual([expected]);
  });
});

describe("the accept rule", () => {
  const ok = "New York Jets vs. Detroit Lions Game Highlights | NFL 2026 Season Week 3";

  it("accepts the known title variants", () => {
    for (const title of [
      ok,
      "Detroit Lions vs New York Jets Game Highlights | 2026 NFL Season Week 3",
      "New York Jets vs Detroit Lions Game Highlights | NFL 2026 Week 3",
      "New York Jets vs. Detroit Lions Game Highlights from Munich | 2026 NFL Season Week 3",
    ]) {
      expect(isGameHighlights(nfl("a", title), "DET", "NYJ", 3), title).toBe(true);
    }
  });

  it("rejects other channels, other weeks, missing clubs and preview wording", () => {
    expect(isGameHighlights({ ...nfl("a", ok), channelId: "UCsomeoneelse" }, "DET", "NYJ", 3)).toBe(
      false,
    );
    expect(isGameHighlights(nfl("a", ok.replace("Week 3", "Week 13")), "DET", "NYJ", 3)).toBe(
      false,
    );
    expect(isGameHighlights(nfl("a", ok), "DET", "NYJ", 1)).toBe(false);
    expect(isGameHighlights(nfl("a", ok), "DET", "NYG", 3)).toBe(false);
    expect(
      isGameHighlights(
        nfl("a", "New York Jets vs. Detroit Lions Game Highlights Recap | Week 3"),
        "DET",
        "NYJ",
        3,
      ),
    ).toBe(false);
  });

  it("takes the earliest upload when the league posts the package twice", () => {
    const pool = [
      nfl("later000001", ok, "2026-09-28T01:00:00Z"),
      nfl("earlier0001", ok, "2026-09-27T21:00:00Z"),
    ];
    expect(pickGameHighlights(pool, "DET", "NYJ", 3)?.videoId).toBe("earlier0001");
    expect(pickGameHighlights([], "DET", "NYJ", 3)).toBeNull();
  });

  it("builds the query and the search fallback", () => {
    expect(searchQuery("DET", "NYJ")).toBe("New York Jets vs. Detroit Lions Game Highlights");
    expect(searchUrl(2026, 3, "DET", "NYJ")).toBe(
      "https://www.youtube.com/results?search_query=New%20York%20Jets%20vs.%20Detroit%20Lions%202026%20week%203%20game%20highlights",
    );
  });
});

describe("searchVideos", () => {
  it("builds the request, parses items and never leaks the key in errors", async () => {
    const calls: string[] = [];
    const fakeFetch = (url: string) => {
      calls.push(url);
      const body = {
        items: [
          {
            id: { videoId: "abc123DEF45" },
            snippet: {
              title: "Lions &amp; Jets",
              channelId: NFL_CHANNEL_ID,
              channelTitle: "NFL",
              publishedAt: "2026-09-27T21:00:00Z",
            },
          },
          { id: { kind: "youtube#channel" }, snippet: { title: "skip" } },
        ],
      };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    };
    const out = await searchVideos({
      apiKey: "SECRET",
      q: "Lions",
      channelId: NFL_CHANNEL_ID,
      publishedAfter: "2026-09-27T17:00:00Z",
      publishedBefore: "2026-10-04T17:00:00Z",
      fetch: fakeFetch,
    });
    expect(out).toEqual([
      {
        videoId: "abc123DEF45",
        title: "Lions & Jets",
        channelId: NFL_CHANNEL_ID,
        channel: "NFL",
        publishedAt: "2026-09-27T21:00:00Z",
      },
    ]);
    const u = new URL(calls[0] ?? "");
    expect(u.searchParams.get("channelId")).toBe(NFL_CHANNEL_ID);
    expect(u.searchParams.get("type")).toBe("video");
    expect(u.searchParams.get("key")).toBe("SECRET");

    const failing = () => Promise.resolve(new Response("nope", { status: 403 }));
    const attempt = searchVideos({
      apiKey: "SECRET",
      q: "x",
      channelId: NFL_CHANNEL_ID,
      publishedAfter: "a",
      publishedBefore: "b",
      fetch: failing,
    });
    await expect(attempt).rejects.toThrow(/HTTP 403/);
    await attempt.catch((e: unknown) => {
      expect(String(e)).not.toContain("SECRET");
    });
    expect(decodeEntities("a &amp; b &quot;c&quot; &lt;d&gt; &#39;e")).toBe(`a & b "c" <d> 'e`);
  });
});
