import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { NotReadyError } from "../src/errors.js";
import type { EmbedResult } from "../src/highlights/embedCheck.js";
import { runHighlights } from "../src/highlights/run.js";
import { memoryLogger } from "../src/log.js";
import { fixtureFetch } from "./helpers.js";

let cacheDir = "";
beforeAll(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "huddle-hl-cache-"));
});
afterAll(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

const KEY_PLAYS = {
  season: 2026,
  week: 3,
  gameId: "2026_03_NYJ_DET",
  plays: [
    {
      playId: 1389,
      qtr: 2,
      clock: "05:40",
      down: 2,
      ydstogo: 12,
      yardline100: 24,
      posteam: "NYJ",
      desc: "(5:40) (Shotgun) 7-G.Smith pass deep right to 16-K.Sadiq for 24 yards, TOUCHDOWN.",
      epa: 3.41,
      wpa: 0.112,
      tags: ["td", "explosive"],
    },
    {
      playId: 2265,
      qtr: 3,
      clock: "11:06",
      down: 1,
      ydstogo: 10,
      yardline100: 17,
      posteam: "DET",
      desc: "(11:06) 0-J.Gibbs right end for 17 yards, TOUCHDOWN.",
      epa: 4.1,
      wpa: 0.13,
      tags: ["td", "explosive"],
    },
  ],
};

const item = (videoId: string, title: string, publishedAt: string, channelTitle = "NFL") => ({
  id: { videoId },
  snippet: { title, channelTitle, publishedAt },
});

/** YouTube responses keyed by the `q` parameter. */
function youtubeFetch(byQuery: Record<string, unknown[]>) {
  const calls: string[] = [];
  const fetch = (url: string) => {
    const q = new URL(url).searchParams.get("q") ?? "";
    calls.push(q);
    return Promise.resolve(
      new Response(JSON.stringify({ items: byQuery[q] ?? [] }), { status: 200 }),
    );
  };
  return { fetch, calls };
}

async function dataDir(extra: Record<string, unknown> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "huddle-hl-"));
  const week = join(dir, "2026", "week-03");
  await mkdir(week, { recursive: true });
  await writeFile(join(week, "key-plays.json"), JSON.stringify(KEY_PLAYS));
  for (const [name, value] of Object.entries(extra)) {
    await writeFile(join(week, name), JSON.stringify(value));
  }
  return dir;
}

/** Fake embed check: the broadcaster package plays, league clips do not. */
const embedCheck = (ids: readonly string[]) =>
  Promise.resolve(
    new Map<string, EmbedResult>(
      ids.map((id) => [id, id === "xsJzYyK4mGE" ? "embeddable" : "blocked"]),
    ),
  );

const base = () => ({
  embedCheck,
  season: 2026,
  week: 3 as const,
  team: "DET",
  cacheDir,
  fetchImpl: fixtureFetch(),
  now: new Date("2026-09-30T12:00:00Z"),
});

interface Written {
  game: { videoId: string; kind: string; source: string; embeddable: boolean } | null;
  plays: Record<string, { videoId: string; embeddable: boolean }>;
  candidates: Record<string, { videoId: string; score: number }[]>;
  searchUrl: string;
}
const read = async (dir: string): Promise<Written> =>
  JSON.parse(await readFile(join(dir, "2026", "week-03", "highlights.json"), "utf8")) as Written;

describe("runHighlights", () => {
  it("searches several phrasings, keeps official channels, matches clips and writes the file", async () => {
    const dir = await dataDir();
    const yt = youtubeFetch({
      "New York Jets vs. Detroit Lions Game Highlights": [
        item(
          "xsJzYyK4mGE",
          "New York Jets vs. Detroit Lions Game Highlights | NFL 2026 Season Week 3",
          "2026-09-27T20:28:58Z",
        ),
        item("GSZ0Bax9eeA", "Jets VS Lions down to the wire ending!", "2026-09-27T20:37:39Z"),
      ],
      Sadiq: [
        item(
          "vEotpncIWNw",
          "Sadiq! Geno slings rookie TE his first receiving touchdown",
          "2026-09-27T18:19:25Z",
        ),
      ],
      "Gibbs touchdown": [
        item("tyBCYiKZLAg", "Every Jahmyr Gibbs touch | Week 3", "2026-09-27T21:00:00Z"),
        item(
          "5KFGhVPAtkg",
          "Gibbs flips the whole defense around on ELECTRIC run",
          "2026-09-27T18:46:46Z",
        ),
        item("fanUpload01", "Gibbs TD run", "2026-09-27T18:50:00Z", "RD_Prodzz"),
      ],
    });
    const log = memoryLogger();
    const result = await runHighlights({
      ...base(),
      dataDir: dir,
      apiKey: "k",
      youtubeFetch: yt.fetch,
      log,
    });
    expect(result).toMatchObject({ gameId: "2026_03_NYJ_DET", clips: 2, game: true, searches: 7 });
    expect(yt.calls).toEqual([
      "New York Jets vs. Detroit Lions Game Highlights",
      "Sadiq",
      "Sadiq touchdown",
      "Sadiq Lions Jets",
      "Gibbs",
      "Gibbs touchdown",
      "Gibbs Lions Jets",
    ]);
    const written = await read(dir);
    expect(written.game).toMatchObject({
      videoId: "xsJzYyK4mGE",
      kind: "game",
      source: "youtube-api",
    });
    expect(written.game?.embeddable).toBe(true);
    expect(written.plays["1389"]).toMatchObject({ videoId: "vEotpncIWNw", embeddable: false });
    expect(written.plays["2265"]?.videoId).toBe("5KFGhVPAtkg");
    // The fan upload scored well but is not an official channel, so it is not even a candidate.
    expect(written.candidates["2265"]?.map((c) => c.videoId)).toEqual(["5KFGhVPAtkg"]);
    expect(written.candidates["1389"]?.[0]?.score).toBeGreaterThanOrEqual(2);
    expect(written.searchUrl).toContain("search_query=");
    expect(log.lines.join("\n")).not.toContain("key=k");

    // A rerun with the same answers is byte-identical.
    const before = await readFile(join(dir, "2026", "week-03", "highlights.json"), "utf8");
    await runHighlights({ ...base(), dataDir: dir, apiKey: "k", youtubeFetch: yt.fetch });
    expect(await readFile(join(dir, "2026", "week-03", "highlights.json"), "utf8")).toBe(before);
  });

  it("keeps manual entries, skips their searches, and replaces API entries", async () => {
    const manual = {
      videoId: "manual00001",
      url: "https://www.youtube.com/watch?v=manual00001",
      title: "Hand-picked clip",
      channel: "NFL",
      kind: "clip",
      publishedAt: null,
      embeddable: false,
      source: "manual",
    };
    const stale = {
      ...manual,
      videoId: "stale000001",
      url: "https://www.youtube.com/watch?v=stale000001",
      source: "youtube-api",
    };
    const dir = await dataDir({
      "highlights.json": {
        season: 2026,
        week: 3,
        gameId: "2026_03_NYJ_DET",
        game: null,
        plays: { "1389": manual, "2265": stale },
        candidates: {},
        searchUrl: "https://www.youtube.com/results?search_query=x",
      },
    });
    const yt = youtubeFetch({});
    await runHighlights({ ...base(), dataDir: dir, apiKey: "k", youtubeFetch: yt.fetch });
    expect(yt.calls).toEqual([
      "New York Jets vs. Detroit Lions Game Highlights",
      "Gibbs",
      "Gibbs touchdown",
      "Gibbs Lions Jets",
    ]);
    const written = await read(dir);
    expect(written.plays["1389"]?.videoId).toBe("manual00001");
    expect(written.plays["2265"]).toBeUndefined();
  });

  it("without a key writes the search fallback and keeps existing links", async () => {
    const dir = await dataDir();
    const log = memoryLogger();
    const result = await runHighlights({ ...base(), dataDir: dir, log });
    expect(result).toMatchObject({ clips: 0, game: false, searches: 0 });
    expect(log.lines.some((l) => l.includes("HUDDLE_YOUTUBE_API_KEY"))).toBe(true);
    const written = await read(dir);
    expect(written.searchUrl).toContain("Detroit%20Lions");
    expect(written.plays).toEqual({});
    expect(written.candidates).toEqual({});
  });

  it("fails as not-ready when the week has not been built, and no-ops on a bye", async () => {
    const dir = await mkdtemp(join(tmpdir(), "huddle-hl-"));
    await expect(runHighlights({ ...base(), dataDir: dir, apiKey: "k" })).rejects.toBeInstanceOf(
      NotReadyError,
    );
    const bye = await runHighlights({ ...base(), week: 6, dataDir: dir, apiKey: "k" });
    expect(bye.gameId).toBeNull();
  });
});
