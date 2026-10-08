import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { NotReadyError } from "../src/errors.js";
import { NFL_CHANNEL_ID } from "../src/highlights/match.js";
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

const TITLE = "New York Jets vs. Detroit Lions Game Highlights | NFL 2026 Season Week 3";

function youtubeFetch(items: unknown[]) {
  const calls: URL[] = [];
  const fetch = (url: string) => {
    calls.push(new URL(url));
    return Promise.resolve(new Response(JSON.stringify({ items }), { status: 200 }));
  };
  return { fetch, calls };
}

const item = (videoId: string, title: string, channelId = NFL_CHANNEL_ID) => ({
  id: { videoId },
  snippet: { title, channelId, channelTitle: "NFL", publishedAt: "2026-09-27T20:28:58Z" },
});

async function dataDir(existing?: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "huddle-hl-"));
  const week = join(dir, "2026", "week-03");
  await mkdir(week, { recursive: true });
  await writeFile(join(week, "game.json"), "{}");
  if (existing !== undefined)
    await writeFile(join(week, "game-highlights.json"), JSON.stringify(existing));
  return dir;
}

const base = () => ({
  season: 2026,
  week: 3 as const,
  team: "DET",
  cacheDir,
  fetchImpl: fixtureFetch(),
  now: new Date("2026-09-30T12:00:00Z"),
});

interface Written {
  gameId: string;
  video: { videoId: string; source: string; url: string } | null;
  searchUrl: string;
}
const read = async (dir: string): Promise<Written> =>
  JSON.parse(
    await readFile(join(dir, "2026", "week-03", "game-highlights.json"), "utf8"),
  ) as Written;

describe("runHighlights", () => {
  it("makes one channel-restricted search in the week after kickoff and writes the match", async () => {
    const dir = await dataDir();
    const yt = youtubeFetch([
      item("qahjjvrG2kI", "New York Jets vs Detroit Lions Game Preview | 2026 Week 3"),
      item("xsJzYyK4mGE", TITLE),
    ]);
    const log = memoryLogger();
    const result = await runHighlights({
      ...base(),
      dataDir: dir,
      apiKey: "k",
      youtubeFetch: yt.fetch,
      log,
    });
    expect(result).toMatchObject({ gameId: "2026_03_NYJ_DET", found: true });
    expect(yt.calls).toHaveLength(1);
    const q = yt.calls[0]?.searchParams;
    expect(q?.get("q")).toBe("New York Jets vs. Detroit Lions Game Highlights");
    expect(q?.get("channelId")).toBe(NFL_CHANNEL_ID);
    expect(q?.get("publishedAfter")).toBe("2026-09-27T17:00:00.000Z");
    expect(q?.get("publishedBefore")).toBe("2026-10-04T17:00:00.000Z");
    const written = await read(dir);
    expect(written.video).toMatchObject({
      videoId: "xsJzYyK4mGE",
      source: "youtube-api",
      url: "https://www.youtube.com/watch?v=xsJzYyK4mGE",
    });
    expect(log.lines.join("\n")).not.toContain("key=k");

    const before = await readFile(join(dir, "2026", "week-03", "game-highlights.json"), "utf8");
    await runHighlights({ ...base(), dataDir: dir, apiKey: "k", youtubeFetch: yt.fetch });
    expect(await readFile(join(dir, "2026", "week-03", "game-highlights.json"), "utf8")).toBe(
      before,
    );
  });

  it("keeps an earlier find when a later search comes back empty", async () => {
    const dir = await dataDir({
      season: 2026,
      week: 3,
      gameId: "2026_03_NYJ_DET",
      video: {
        videoId: "xsJzYyK4mGE",
        url: "https://www.youtube.com/watch?v=xsJzYyK4mGE",
        title: TITLE,
        channel: "NFL",
        publishedAt: null,
        source: "youtube-api",
      },
      searchUrl: "https://www.youtube.com/results?search_query=x",
    });
    const result = await runHighlights({
      ...base(),
      dataDir: dir,
      apiKey: "k",
      youtubeFetch: youtubeFetch([]).fetch,
    });
    expect(result.found).toBe(true);
    expect((await read(dir)).video?.videoId).toBe("xsJzYyK4mGE");
  });

  it("never searches over a manual entry", async () => {
    const dir = await dataDir({
      season: 2026,
      week: 3,
      gameId: "2026_03_NYJ_DET",
      video: {
        videoId: "manual00001",
        url: "https://www.youtube.com/watch?v=manual00001",
        title: "Hand-picked",
        channel: "NFL",
        publishedAt: null,
        source: "manual",
      },
      searchUrl: "https://www.youtube.com/results?search_query=x",
    });
    const yt = youtubeFetch([item("xsJzYyK4mGE", TITLE)]);
    await runHighlights({ ...base(), dataDir: dir, apiKey: "k", youtubeFetch: yt.fetch });
    expect(yt.calls).toHaveLength(0);
    expect((await read(dir)).video?.videoId).toBe("manual00001");
  });

  it("writes the search fallback when nothing matches and no key is set", async () => {
    const dir = await dataDir();
    const log = memoryLogger();
    const result = await runHighlights({ ...base(), dataDir: dir, log });
    expect(result.found).toBe(false);
    expect(log.lines.some((l) => l.includes("HUDDLE_YOUTUBE_API_KEY"))).toBe(true);
    const written = await read(dir);
    expect(written.video).toBeNull();
    expect(written.searchUrl).toContain("Detroit%20Lions");

    const other = youtubeFetch([item("fake0000001", TITLE, "UCnotTheLeague")]);
    const again = await runHighlights({
      ...base(),
      dataDir: dir,
      apiKey: "k",
      youtubeFetch: other.fetch,
    });
    expect(again.found).toBe(false);
  });

  it("fails as not-ready before the week is built, and no-ops on a bye", async () => {
    const dir = await mkdtemp(join(tmpdir(), "huddle-hl-"));
    await expect(runHighlights({ ...base(), dataDir: dir, apiKey: "k" })).rejects.toBeInstanceOf(
      NotReadyError,
    );
    const bye = await runHighlights({ ...base(), week: 6, dataDir: dir, apiKey: "k" });
    expect(bye).toEqual({ gameId: null, path: null, found: false });
  });
});
