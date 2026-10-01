import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fetchAsset } from "../src/download.js";
import { memoryLogger } from "../src/log.js";
import {
  ASSETS,
  assetFileName,
  assetSpec,
  assetUrl,
  tagsForTier,
  timestampUrl,
} from "../src/sources.js";
import { fixtureFetch } from "./helpers.js";

let cacheDir: string;
beforeAll(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "huddle-cache-"));
});
afterAll(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

describe("sources", () => {
  it("builds nflverse release URLs", () => {
    expect(assetUrl("pbp", "play_by_play_2026.csv.gz")).toBe(
      "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2026.csv.gz",
    );
    expect(timestampUrl("schedules")).toMatch(/schedules\/timestamp\.txt$/);
    expect(assetFileName("pbp", 2025)).toBe("play_by_play_2025.csv.gz");
    expect(assetFileName("games", 2025)).toBe("games.csv");
    expect(assetSpec("ftn").license).toBe("CC-BY-SA-4.0");
    expect(() => assetSpec("nope" as "pbp")).toThrow(/unknown asset/);
    expect(ASSETS.some((a) => a.tag === "player_stats")).toBe(false);
  });

  it("lists PFR only for the final tier", () => {
    expect(tagsForTier("provisional")).not.toContain("pfr_advstats");
    expect(tagsForTier("final")).toContain("pfr_advstats");
    expect(tagsForTier("final")).toEqual([...tagsForTier("final")].sort());
  });
});

describe("fetchAsset", () => {
  it("downloads, stamps, then serves from cache until the stamp changes or --refresh", async () => {
    const log = memoryLogger();
    const fetchImpl = fixtureFetch({ snap_counts: "stamp-A" });
    const first = await fetchAsset("snapCounts", 2026, { cacheDir, fetchImpl, log });
    expect(first.fromCache).toBe(false);
    expect(first.stamp).toBe("stamp-A");
    expect(first.path).toBe(join(cacheDir, "snap_counts", "snap_counts_2026.csv"));
    expect(await readFile(`${first.path}.stamp`, "utf8")).toBe("stamp-A");
    expect((await readFile(first.path, "utf8")).startsWith("game_id,")).toBe(true);
    expect(fetchImpl.calls).toHaveLength(2);

    const second = await fetchAsset("snapCounts", 2026, { cacheDir, fetchImpl, log });
    expect(second.fromCache).toBe(true);
    expect(fetchImpl.calls).toHaveLength(3);
    expect(log.lines.some((l) => l.startsWith("cache hit"))).toBe(true);

    const refreshed = await fetchAsset("snapCounts", 2026, {
      cacheDir,
      fetchImpl,
      log,
      refresh: true,
    });
    expect(refreshed.fromCache).toBe(false);

    // A new remote stamp over identical bytes (nflverse re-stamps schedules every few minutes)
    // re-downloads but keeps reporting the stamp of the last content change.
    const restamped = fixtureFetch({ snap_counts: "stamp-B" });
    const third = await fetchAsset("snapCounts", 2026, { cacheDir, fetchImpl: restamped });
    expect(third.fromCache).toBe(false);
    expect(third.stamp).toBe("stamp-A");
    expect(await readFile(`${third.path}.stamp`, "utf8")).toBe("stamp-B");
    expect(await readFile(`${third.path}.content-stamp`, "utf8")).toBe("stamp-A");
    const hit = await fetchAsset("snapCounts", 2026, { cacheDir, fetchImpl: restamped });
    expect(hit.fromCache).toBe(true);
    expect(hit.stamp).toBe("stamp-A");

    // Different bytes move the content stamp.
    const base = fixtureFetch({ snap_counts: "stamp-C" });
    const edited = async (url: string) => {
      const response = await base(url);
      if (!url.endsWith("snap_counts_2026.csv")) return response;
      return new Response(`${await response.text()}\n`);
    };
    const fourth = await fetchAsset("snapCounts", 2026, { cacheDir, fetchImpl: edited });
    expect(fourth.fromCache).toBe(false);
    expect(fourth.stamp).toBe("stamp-C");
    expect(await readFile(`${fourth.path}.content-stamp`, "utf8")).toBe("stamp-C");
  });

  it("re-downloads when the file is missing even if the stamp matches", async () => {
    const fetchImpl = fixtureFetch({ players: "same" });
    const spec = assetSpec("players");
    await writeFile(join(cacheDir, spec.tag, "x"), "").catch(() => undefined);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(cacheDir, spec.tag), { recursive: true });
    await writeFile(join(cacheDir, spec.tag, "players.csv.stamp"), "same");
    const asset = await fetchAsset("players", 2026, { cacheDir, fetchImpl });
    expect(asset.fromCache).toBe(false);
  });

  it("keeps gz assets compressed on disk", async () => {
    const asset = await fetchAsset("pbp", 2026, { cacheDir, fetchImpl: fixtureFetch() });
    const bytes = await readFile(asset.path);
    expect(bytes[0]).toBe(0x1f);
    expect(bytes[1]).toBe(0x8b);
  });

  it("surfaces HTTP failures", async () => {
    const notFound = () => Promise.resolve(new Response("nope", { status: 404 }));
    await expect(fetchAsset("games", 2026, { cacheDir, fetchImpl: notFound })).rejects.toThrow(
      /HTTP 404/,
    );
    const stampOk = fixtureFetch();
    const assetMissing = async (url: string) =>
      url.endsWith("timestamp.txt") ? stampOk(url) : new Response("gone", { status: 500 });
    await expect(fetchAsset("games", 2026, { cacheDir, fetchImpl: assetMissing })).rejects.toThrow(
      /download failed .*games\.csv: HTTP 500/,
    );
  });
});
