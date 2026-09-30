import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { NotReadyError } from "../src/errors.js";
import { loadWeekInputs } from "../src/load.js";
import { memoryLogger } from "../src/log.js";
import { runWeek } from "../src/run.js";
import { fixtureFetch, stubEngine } from "./helpers.js";

let cacheDir: string;
let dataDir: string;
beforeAll(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "huddle-run-cache-"));
  dataDir = await mkdtemp(join(tmpdir(), "huddle-run-data-"));
});
afterAll(async () => {
  await rm(cacheDir, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
});

const now = new Date("2026-09-30T13:00:00Z");

describe("loadWeekInputs", () => {
  it("reduces every asset to the week and records the stamps", async () => {
    const log = memoryLogger();
    const inputs = await loadWeekInputs({
      season: 2026,
      week: 3,
      tier: "provisional",
      cacheDir,
      fetchImpl: fixtureFetch({ pbp: "pbp-stamp" }),
      log,
    });
    expect(inputs?.game.gameId).toBe("2026_03_NYJ_DET");
    expect(inputs?.pbp.length).toBe(685);
    expect(inputs?.pfr).toBeNull();
    expect(inputs?.sources.pbp).toBe("pbp-stamp");
    expect(Object.keys(inputs?.sources ?? {})).not.toContain("pfr_advstats");
    expect(inputs?.depthCharts.every((r) => r.dt <= "2026-09-27T20:05:00Z")).toBe(true);
    expect(inputs?.kickoffs.size).toBe(8);
    expect(log.lines.some((l) => l.includes("PFR advanced stats skipped"))).toBe(true);
  });

  it("loads PFR for the final tier, resolves auto, and returns null on a bye", async () => {
    const final = await loadWeekInputs({
      season: 2026,
      week: "auto",
      tier: "final",
      cacheDir,
      fetchImpl: fixtureFetch(),
      now,
    });
    expect(final?.week).toBe(3);
    expect(final?.pfr?.def.length).toBe(50);
    expect(final?.sources.pfr_advstats).toBeDefined();
    const bye = await loadWeekInputs({
      season: 2026,
      week: 6,
      tier: "provisional",
      cacheDir,
      fetchImpl: fixtureFetch(),
    });
    expect(bye).toBeNull();
    await expect(
      loadWeekInputs({
        season: 2026,
        week: "auto",
        tier: "provisional",
        cacheDir,
        fetchImpl: fixtureFetch(),
        now: new Date("2026-08-01T00:00:00Z"),
      }),
    ).rejects.toThrow(NotReadyError);
  });
});

describe("runWeek", () => {
  it("writes the week, the manifest and an optional fixture dump, deterministically", async () => {
    const log = memoryLogger();
    const first = await runWeek({
      season: 2026,
      week: 3,
      tier: "provisional",
      cacheDir,
      dataDir,
      fetchImpl: fixtureFetch(),
      engine: stubEngine,
      log,
    });
    expect(first.status).toBe("written");
    expect(first.game?.gameId).toBe("2026_03_NYJ_DET");
    expect(first.files.length).toBe(7);
    const weekDir = join(dataDir, "2026", "week-03");
    expect((await readdir(weekDir)).sort()).toEqual([
      "game.json",
      "grades.json",
      "key-plays.json",
      "league-baselines.json",
      "meta.json",
      "team-metrics.json",
      "win-probability.json",
    ]);
    const manifest = JSON.parse(await readFile(join(dataDir, "manifest.json"), "utf8")) as {
      weeks: unknown[];
    };
    expect(manifest.weeks).toHaveLength(1);
    const before = await readFile(join(weekDir, "grades.json"), "utf8");
    const second = await runWeek({
      season: 2026,
      week: 3,
      tier: "provisional",
      cacheDir,
      dataDir,
      fetchImpl: fixtureFetch(),
      engine: stubEngine,
      dumpFixture: true,
    });
    expect(await readFile(join(weekDir, "grades.json"), "utf8")).toBe(before);
    expect(second.files.length).toBe(9);
    const dump = second.files.find((f) => f.endsWith("input.json"));
    expect(dump).toMatch(/out[\\/]fixtures[\\/]2026-w03[\\/]input\.json$/);
    const meta = JSON.parse(await readFile(join(weekDir, "meta.json"), "utf8")) as {
      tier: string;
      sources: Record<string, string>;
    };
    expect(meta.tier).toBe("provisional");
    expect(meta.sources.snap_counts).toBeDefined();
    expect(log.lines.some((l) => l.startsWith("wrote 7 files"))).toBe(true);
  });

  it("reports a bye without writing", async () => {
    const out = await runWeek({
      season: 2026,
      week: 6,
      tier: "provisional",
      cacheDir,
      dataDir,
      fetchImpl: fixtureFetch(),
      engine: stubEngine,
    });
    expect(out).toEqual({ status: "bye", game: null, files: [] });
  });
});
