import type { KeyPlay } from "@huddle/shared";
import { describe, expect, it } from "vitest";

import {
  focusNames,
  isCompilation,
  isGameHighlights,
  isOfficial,
  matchClips,
  playerNames,
  queryPhrasings,
  topCandidates,
  scoreClip,
  searchUrl,
  toVideo,
  type VideoCandidate,
} from "../src/highlights/match.js";
import { decodeEntities, searchVideos } from "../src/highlights/youtube.js";

const play = (overrides: Partial<KeyPlay> & Pick<KeyPlay, "playId" | "desc">): KeyPlay => ({
  qtr: 2,
  clock: "05:40",
  down: 2,
  ydstogo: 12,
  yardline100: 24,
  posteam: "NYJ",
  epa: 3.4,
  wpa: 0.11,
  tags: [],
  ...overrides,
});

const vid = (
  videoId: string,
  title: string,
  publishedAt = "2026-09-27T18:19:25Z",
): VideoCandidate => ({
  videoId,
  title,
  channel: "NFL",
  publishedAt,
});

describe("playerNames", () => {
  it("extracts last names in order, including two-word and suffixed names", () => {
    const desc =
      "(1:40) 16-J.Goff pass short right to 14-A.St. Brown for 4 yards, TOUCHDOWN. Tackled by 8-A.Cisco Jr.";
    expect(playerNames(desc)).toEqual(["Goff", "St. Brown", "Cisco"]);
  });

  it("drops the passer from the focus names on a completed pass but not on a sack", () => {
    expect(
      focusNames(
        play({
          playId: 1,
          desc: "7-G.Smith pass deep right to 16-K.Sadiq for 24 yards, TOUCHDOWN.",
        }),
      ),
    ).toEqual(["Sadiq"]);
    expect(
      focusNames(
        play({
          playId: 2,
          desc: "7-G.Smith sacked at DET 41 for -13 yards (36-C.Clark). FUMBLES (36-C.Clark)",
        }),
      ),
    ).toEqual(["Smith", "Clark"]);
    expect(
      focusNames(play({ playId: 3, desc: "0-J.Gibbs right end for 17 yards, TOUCHDOWN." })),
    ).toEqual(["Gibbs"]);
  });
});

describe("scoring", () => {
  const sadiq = play({
    playId: 1389,
    desc: "(5:40) (Shotgun) 7-G.Smith pass deep right to 16-K.Sadiq for 24 yards, TOUCHDOWN.",
    tags: ["td", "explosive"],
  });
  const gibbsRun = play({
    playId: 2265,
    qtr: 3,
    clock: "11:06",
    desc: "(11:06) 0-J.Gibbs right end for 17 yards, TOUCHDOWN.",
    tags: ["td", "explosive"],
    posteam: "DET",
  });
  const gibbsCatch = play({
    playId: 3817,
    qtr: 4,
    clock: "02:30",
    desc: "(2:30) (Shotgun) 16-J.Goff pass short right to 0-J.Gibbs for 11 yards, TOUCHDOWN.",
    tags: ["td"],
    posteam: "DET",
  });

  it("rewards the right player and keywords, penalises compilations and the wrong play type", () => {
    expect(
      scoreClip(sadiq, vid("a", "Sadiq! Geno slings rookie TE his first receiving touchdown")),
    ).toBe(3);
    expect(scoreClip(sadiq, vid("b", "Every Kenyon Sadiq catch from 105-yard game | Week 3"))).toBe(
      -10,
    );
    expect(scoreClip(sadiq, vid("c", "Garrett Wilson Fourth-Down TD!"))).toBe(0);
    expect(
      scoreClip(gibbsRun, vid("d", "Gibbs flips the whole defense around on ELECTRIC run")),
    ).toBe(2);
    expect(
      scoreClip(gibbsCatch, vid("d", "Gibbs flips the whole defense around on ELECTRIC run")),
    ).toBe(1);
    expect(scoreClip(gibbsRun, vid("e", "Jahmyr Gibbs 17-yard TD run"))).toBe(4);
  });

  it("assigns each video to at most one play, best score first", () => {
    const videos = [
      vid("run", "Gibbs flips the whole defense around on ELECTRIC run", "2026-09-27T18:46:46Z"),
      vid(
        "catch",
        "JARED GOFF AND JAHMYR GIBBS RETURN THE FAVOR WITH A TD",
        "2026-09-27T20:30:00Z",
      ),
      vid("sadiq", "Sadiq! Geno slings rookie TE his first receiving touchdown"),
      vid("comp", "Jahmyr Gibbs' best plays from 3-TD game | Week 3"),
    ];
    const matches = matchClips(
      [sadiq, gibbsRun, gibbsCatch],
      videos,
      Date.parse("2026-09-27T17:00:00Z"),
    );
    expect(matches.map((m) => [m.playId, m.video.videoId])).toEqual([
      [1389, "sadiq"],
      [2265, "run"],
      [3817, "catch"],
    ]);
  });

  it("recognises the game package and compilations", () => {
    expect(
      isGameHighlights(
        "New York Jets vs. Detroit Lions Game Highlights | NFL 2026 Season Week 3",
        "DET",
        "NYJ",
      ),
    ).toBe(true);
    expect(
      isGameHighlights(
        "Kansas City Chiefs vs. Miami Dolphins Game Highlights | NFL 2026 Season Week 3",
        "DET",
        "NYJ",
      ),
    ).toBe(false);
    expect(isGameHighlights("Jets VS Lions down to the wire ending!", "DET", "NYJ")).toBe(false);
    expect(isCompilation("Top 15 Plays of Week 3! | 2026 NFL Season")).toBe(true);
    expect(isCompilation("Ruckert TD for the J.E.T.S.")).toBe(false);
  });

  it("builds the video record and the search fallback", () => {
    expect(toVideo(vid("xsJzYyK4mGE", "T"), "game")).toMatchObject({
      url: "https://www.youtube.com/watch?v=xsJzYyK4mGE",
      kind: "game",
      source: "youtube-api",
    });
    expect(searchUrl(2026, 3, "DET", "NYJ")).toBe(
      "https://www.youtube.com/results?search_query=New%20York%20Jets%20vs.%20Detroit%20Lions%202026%20week%203%20highlights",
    );
  });
});

describe("phrasings, channels and top candidates", () => {
  const sadiq = play({
    playId: 1389,
    desc: "(5:40) (Shotgun) 7-G.Smith pass deep right to 16-K.Sadiq for 24 yards, TOUCHDOWN.",
    tags: ["td", "explosive"],
  });

  it("asks for the same play several ways", () => {
    expect(queryPhrasings(sadiq, "DET", "NYJ")).toEqual([
      "Sadiq",
      "Sadiq touchdown",
      "Sadiq Lions Jets",
    ]);
    const sack = play({
      playId: 4086,
      desc: "(:51) 7-G.Smith sacked at DET 41 for -13 yards (36-C.Clark). FUMBLES (36-C.Clark)",
      tags: ["turnover", "sack"],
    });
    expect(queryPhrasings(sack, "DET", "NYJ")).toEqual([
      "Smith | Clark",
      "Smith sack",
      "Smith Lions Jets",
      "Smith Clark",
    ]);
    expect(queryPhrasings(play({ playId: 1, desc: "Timeout." }), "DET", "NYJ")).toEqual([]);
  });

  it("keeps only the league, the two clubs and the broadcasters", () => {
    const v = (channel: string) => ({ videoId: "x", title: "t", channel, publishedAt: null });
    expect(isOfficial(v("NFL"), "DET", "NYJ")).toBe(true);
    expect(isOfficial(v("Detroit Lions"), "DET", "NYJ")).toBe(true);
    expect(isOfficial(v("new york jets "), "DET", "NYJ")).toBe(true);
    expect(isOfficial(v("NFL on FOX"), "DET", "NYJ")).toBe(true);
    expect(isOfficial(v("Chicago Bears"), "DET", "NYJ")).toBe(false);
    expect(isOfficial(v("RD_Prodzz"), "DET", "NYJ")).toBe(false);
  });

  it("ranks the top three real matches for a play", () => {
    const videos = [
      vid("a", "Sadiq! Geno slings rookie TE his first receiving touchdown"),
      vid("b", "Kenyon Sadiq lays out for the catch"),
      vid("c", "Sadiq catch"),
      vid("d", "Sadiq TD"),
      vid("e", "Garrett Wilson Fourth-Down TD!"),
      vid("f", "Every Kenyon Sadiq catch | Week 3"),
    ];
    const top = topCandidates(sadiq, videos);
    expect(top.map((t) => [t.videoId, t.score])).toEqual([
      ["a", 3],
      ["d", 3],
      ["b", 2],
    ]);
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
              title: "Gibbs&#39; TD",
              channelTitle: "NFL",
              publishedAt: "2026-09-27T18:00:00Z",
            },
          },
          { id: { kind: "youtube#channel" }, snippet: { title: "skip" } },
        ],
      };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    };
    const out = await searchVideos({
      apiKey: "SECRET",
      q: "Gibbs",
      publishedAfter: "2026-09-27T17:00:00Z",
      publishedBefore: "2026-09-29T17:00:00Z",
      fetch: fakeFetch,
    });
    expect(out).toEqual([
      {
        videoId: "abc123DEF45",
        title: "Gibbs' TD",
        channel: "NFL",
        publishedAt: "2026-09-27T18:00:00Z",
      },
    ]);
    const u = new URL(calls[0] ?? "");
    expect(u.searchParams.get("channelId")).toBeNull();
    expect(u.searchParams.get("type")).toBe("video");
    expect(u.searchParams.get("q")).toBe("Gibbs");
    expect(u.searchParams.get("key")).toBe("SECRET");

    const failing = () => Promise.resolve(new Response("nope", { status: 403 }));
    await expect(
      searchVideos({
        apiKey: "SECRET",
        q: "x",
        publishedAfter: "a",
        publishedBefore: "b",
        fetch: failing,
      }),
    ).rejects.toThrow(/HTTP 403/);
    await expect(
      searchVideos({
        apiKey: "SECRET",
        q: "x",
        publishedAfter: "a",
        publishedBefore: "b",
        fetch: failing,
      }),
    ).rejects.not.toThrow(/SECRET/);
    expect(decodeEntities("a &amp; b &quot;c&quot; &lt;d&gt;")).toBe('a & b "c" <d>');
  });
});
