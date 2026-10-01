import { describe, expect, it } from "vitest";

import { USAGE, main, parseCli } from "../src/cli.js";
import { NotReadyError, ValidationError } from "../src/errors.js";
import { memoryLogger } from "../src/log.js";
import { parseWeeks, type RunOptions } from "../src/run.js";
import { stubEngine } from "./helpers.js";

describe("parseCli", () => {
  it("parses season, week, tier and flags", () => {
    expect(
      parseCli(["--season", "2026", "--week", "3", "--final", "--refresh", "--dump-fixture"]),
    ).toEqual({
      command: "week",
      season: 2026,
      week: 3,
      weeks: null,
      tier: "final",
      refresh: true,
      dumpFixture: true,
      dataDir: undefined,
    });
    expect(parseCli(["--season", "2026"])).toMatchObject({ command: "week", week: "auto" });
    expect(parseCli(["--fit-fg-table", "--refresh"])).toEqual({
      command: "fit-fg-table",
      refresh: true,
    });
    expect(parseCli(["--season", "2026", "--weeks", "1-3", "--data-dir", "/tmp/x"])).toMatchObject({
      weeks: [1, 2, 3],
      dataDir: "/tmp/x",
      tier: "provisional",
    });
  });

  it("rejects bad arguments with a ValidationError", () => {
    expect(() => parseCli([])).toThrow(ValidationError);
    expect(() => parseCli(["--season", "1990"])).toThrow(/--season is required/);
    expect(() => parseCli(["--season", "2026", "--week", "99"])).toThrow(/--week must be 1-22/);
    expect(() => parseCli(["--season", "2026", "--bogus"])).toThrow();
    expect(parseCli(["--help"])).toEqual({ command: "help" });
  });

  it("parses week ranges", () => {
    expect(parseWeeks("1-18")).toHaveLength(18);
    expect(parseWeeks("3,1,3")).toEqual([1, 3]);
    expect(() => parseWeeks("5-2")).toThrow(ValidationError);
    expect(() => parseWeeks("x")).toThrow(/bad --weeks/);
  });
});

describe("main", () => {
  const runs: RunOptions[] = [];
  const run = (options: RunOptions) => {
    runs.push(options);
    if (options.week === 6) return Promise.resolve({ status: "bye" as const });
    if (options.week === 4) return Promise.reject(new NotReadyError("week 4 pending"));
    if (options.week === 5) return Promise.reject(new ValidationError("bad week 5"));
    return Promise.resolve({ status: "written" as const });
  };

  it("returns 0 on success and passes the parsed options through", async () => {
    const log = memoryLogger();
    runs.length = 0;
    const code = await main(["--season", "2026", "--week", "3", "--final"], {
      run,
      log,
      engine: stubEngine,
    });
    expect(code).toBe(0);
    expect(runs[0]).toMatchObject({
      season: 2026,
      week: 3,
      tier: "final",
      refresh: false,
      dumpFixture: false,
    });
    expect(runs[0]?.engine).toBe(stubEngine);
  });

  it("returns 3 when the data is not ready and 2 on validation problems", async () => {
    const log = memoryLogger();
    expect(await main(["--season", "2026", "--week", "4"], { run, log, engine: stubEngine })).toBe(
      3,
    );
    expect(log.lines.some((l) => l.includes("not ready: week 4 pending"))).toBe(true);
    expect(await main(["--season", "2026", "--week", "5"], { run, log, engine: stubEngine })).toBe(
      2,
    );
    expect(await main(["--season", "abc"], { run, log, engine: stubEngine })).toBe(2);
    expect(await main(["--help"], { run, log, engine: stubEngine })).toBe(0);
    expect(log.lines).toContain(USAGE);
  });

  it("maps unexpected errors to exit code 2", async () => {
    const log = memoryLogger();
    const boom = () => {
      return Promise.reject(new Error("disk full"));
    };
    expect(
      await main(["--season", "2026", "--week", "3"], { run: boom, log, engine: stubEngine }),
    ).toBe(2);
    expect(log.lines.some((l) => l.includes("disk full"))).toBe(true);
    const weird = () => {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the non-Error path is what is under test
      return Promise.reject("string error");
    };
    expect(
      await main(["--season", "2026", "--week", "3"], { run: weird, log, engine: stubEngine }),
    ).toBe(2);
  });

  it("backfills a range, skipping byes and weeks that are not ready", async () => {
    const log = memoryLogger();
    runs.length = 0;
    const code = await main(["--season", "2026", "--weeks", "3-4,6", "--data-dir", "out"], {
      run,
      log,
      engine: stubEngine,
    });
    expect(code).toBe(0);
    expect(runs.map((r) => r.week)).toEqual([3, 4, 6]);
    expect(runs[0]?.dataDir).toBe("out");
    expect(log.lines.some((l) => l.includes("1 of 3 weeks not ready"))).toBe(true);
    expect(
      await main(["--season", "2026", "--weeks", "4-5"], { run, log, engine: stubEngine }),
    ).toBe(2);
  });
});
