import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { main } from "../src/cli.js";
import { memoryLogger } from "../src/log.js";
import { fgMakeProbability } from "../src/models/fgTable.js";
import { DEFAULT_FIT_SEASONS, fitFgTable } from "../src/models/fitFgTable.js";
import { fixtureFetch } from "./helpers.js";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "huddle-fg-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("fitFgTable", () => {
  it("fits Laplace-smoothed 5-yard buckets from field-goal attempts", async () => {
    const log = memoryLogger();
    const out = join(dir, "fg-make.json");
    const table = await fitFgTable({
      seasons: [2026],
      cacheDir: join(dir, "cache"),
      fetchImpl: fixtureFetch(),
      out,
      log,
    });
    expect(table.bucketSize).toBe(5);
    expect(table.fittedOn).toContain("2026-2026");
    expect(table.buckets.length).toBeGreaterThan(3);
    for (const b of table.buckets) {
      expect(b.to).toBe(b.from + 4);
      expect(b.p).toBeCloseTo((b.made + 1) / (b.att + 2), 4);
      expect(b.made).toBeLessThanOrEqual(b.att);
    }
    expect(table.buckets.map((b) => b.from)).toEqual(
      [...table.buckets.map((b) => b.from)].sort((a, b) => a - b),
    );
    const written = JSON.parse(await readFile(out, "utf8")) as typeof table;
    expect(written).toEqual(table);
    expect(fgMakeProbability(30, written)).toBeGreaterThan(0.5);
    expect(log.lines.some((l) => l.includes("field-goal attempts"))).toBe(true);
    expect(DEFAULT_FIT_SEASONS).toEqual([2021, 2022, 2023, 2024, 2025]);
  });

  it("is reachable from the CLI", async () => {
    const calls: unknown[] = [];
    const fit = (options: unknown) => {
      calls.push(options);
      return Promise.resolve({});
    };
    expect(await main(["--fit-fg-table", "--refresh"], { fit, log: memoryLogger() })).toBe(0);
    expect(calls[0]).toMatchObject({ refresh: true });
  });
});
