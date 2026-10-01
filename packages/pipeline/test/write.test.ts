import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ValidationError } from "../src/errors.js";
import { buildWeek } from "../src/run.js";
import {
  rebuildManifest,
  roundValue,
  stableJson,
  validateArtifacts,
  weekDirName,
  writeWeek,
} from "../src/stages/write.js";
import { loadFixtureInputs, stubEngine } from "./helpers.js";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "huddle-write-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("stableJson", () => {
  it("sorts keys at every level and rounds to three decimals", () => {
    const text = stableJson({
      b: { z: 1 / 3, a: [2 / 3, { y: 1, x: -0.00001 }] },
      a: 5,
      s: "x",
      n: null,
    });
    expect(text).toBe(
      `${JSON.stringify(
        { a: 5, b: { a: [0.667, { x: 0, y: 1 }], z: 0.333 }, n: null, s: "x" },
        null,
        2,
      )}\n`,
    );
  });

  it("keeps integers and booleans untouched and never emits -0", () => {
    expect(roundValue(31)).toBe(31);
    expect(roundValue(true)).toBe(true);
    expect(Object.is(roundValue(-0.0001), 0)).toBe(true);
    expect(roundValue(1.23456)).toBe(1.235);
  });

  it("zero-pads the week directory", () => {
    expect(weekDirName(3)).toBe("week-03");
    expect(weekDirName(18)).toBe("week-18");
  });
});

describe("writeWeek + rebuildManifest", () => {
  it("writes byte-identical files on rerun and rebuilds the manifest from game.json files", async () => {
    const inputs = await loadFixtureInputs("provisional");
    const { artifacts } = buildWeek(inputs, stubEngine);
    const files = await writeWeek(dir, 2026, 3, artifacts);
    expect(files.map((f) => f.split(/[\\/]/).pop()).sort()).toEqual([
      "game.json",
      "grades.json",
      "key-plays.json",
      "league-baselines.json",
      "meta.json",
      "team-metrics.json",
      "win-probability.json",
    ]);
    const first = await Promise.all(files.map((f) => readFile(f, "utf8")));
    await writeWeek(
      dir,
      2026,
      3,
      buildWeek(await loadFixtureInputs("provisional"), stubEngine).artifacts,
    );
    const second = await Promise.all(files.map((f) => readFile(f, "utf8")));
    expect(second).toEqual(first);
    expect(first.every((t) => t.endsWith("\n"))).toBe(true);
    // Every numeric literal has at most three decimals.
    for (const text of first) {
      for (const m of text.matchAll(/-?\d+\.(\d+)/g))
        expect((m[1] ?? "").length).toBeLessThanOrEqual(3);
    }
    const gameText = first[files.findIndex((f) => f.endsWith("game.json"))];
    expect(gameText).toContain('"kickoffUtc": "2026-09-27T17:00:00Z"');
    expect(gameText).not.toMatch(/generatedAt|timestamp/);

    // A second season/week and some junk directories that must be ignored.
    await writeWeek(dir, 2025, 12, {
      ...artifacts,
      game: {
        ...artifacts.game,
        season: 2025,
        week: 12,
        gameId: "2025_12_DET_GB",
        team: { side: "away", opponent: "GB", result: "L" },
      },
    });
    await writeFile(join(dir, "notes.txt"), "x");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(dir, "2024", "week-01"), { recursive: true });
    await mkdir(join(dir, "2026", "scratch"), { recursive: true });
    const manifest = await rebuildManifest(dir);
    expect(manifest.weeks).toEqual([
      {
        season: 2025,
        week: 12,
        gameId: "2025_12_DET_GB",
        tier: "provisional",
        opponent: "GB",
        result: "L",
      },
      {
        season: 2026,
        week: 3,
        gameId: "2026_03_NYJ_DET",
        tier: "provisional",
        opponent: "NYJ",
        result: "W",
      },
    ]);
    const manifestText = await readFile(join(dir, "manifest.json"), "utf8");
    expect(manifestText).toBe(stableJson(manifest));
    expect((await readdir(join(dir, "2026"))).sort()).toEqual(["scratch", "week-03"]);
  });

  it("rejects an artifact that breaks the contract", async () => {
    const inputs = await loadFixtureInputs("provisional");
    const { artifacts } = buildWeek(inputs, stubEngine);
    const broken = { ...artifacts, game: { ...artifacts.game, kickoffUtc: "yesterday" } };
    expect(() => validateArtifacts(broken)).toThrow(ValidationError);
    expect(() => validateArtifacts(broken)).toThrow(/game\.json failed validation: kickoffUtc/);
  });

  it("rebuilds an empty manifest for a missing directory", async () => {
    const empty = join(dir, "nothing-here");
    expect((await rebuildManifest(empty)).weeks).toEqual([]);
  });
});
