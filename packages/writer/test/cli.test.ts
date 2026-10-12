import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { main } from "../src/cli.js";
import type { ModelClient } from "../src/model.js";
import { DATA_DIR, groundedRecap } from "./helpers.js";

function memoryLog() {
  const lines: string[] = [];
  return {
    lines,
    info: (m: string) => lines.push(m),
    warn: (m: string) => lines.push(m),
  };
}

const temp = (prefix: string) => mkdtempSync(join(tmpdir(), prefix));

describe("writer cli", () => {
  it("prints usage and rejects bad arguments", async () => {
    const log = memoryLog();
    expect(await main(["--help"], { log })).toBe(0);
    expect(log.lines.join("\n")).toContain("usage: pnpm writer");
    expect(await main(["--bogus"], { log })).toBe(2);
    expect(await main(["--season", "2026"], { log, dataDir: DATA_DIR })).toBe(2);
  });

  it("writes the prompts on a dry run without calling a model", async () => {
    const outDir = temp("writer-out-");
    const log = memoryLog();
    expect(await main(["--dry-run"], { log, dataDir: DATA_DIR, outDir })).toBe(0);
    expect(readdirSync(outDir).sort()).toEqual(
      expect.arrayContaining(["2026-w03-recap.txt", "2026-w03-division.txt"]),
    );
    expect(
      await main(["--dry-run", "--season", "2026", "--week", "3", "--type", "recap"], {
        log,
        dataDir: DATA_DIR,
        outDir,
      }),
    ).toBe(0);
  });

  it("skips quietly in CI when no sign-in token is configured", async () => {
    const log = memoryLog();
    const code = await main([], { log, dataDir: DATA_DIR, env: { GITHUB_ACTIONS: "true" } });
    expect(code).toBe(0);
    expect(log.lines.join("\n")).toContain("no CLAUDE_CODE_OAUTH_TOKEN");
  });

  it("writes with the configured model and reports failures with exit code 1", async () => {
    const seen: string[] = [];
    const good: ModelClient = () => Promise.resolve({ output: groundedRecap(), costUsd: null });
    const client = (model: string, effort: string) => {
      seen.push(`${model}/${effort}`);
      return good;
    };
    const contentDir = temp("writer-content-");
    const args = ["--season", "2026", "--week", "3", "--type", "recap"];
    const env = { HUDDLE_WRITER_MODEL: "opus", HUDDLE_WRITER_EFFORT: "medium" };
    expect(await main(args, { log: memoryLog(), dataDir: DATA_DIR, contentDir, client, env })).toBe(
      0,
    );
    expect(seen).toEqual(["opus/medium"]);

    const bad: ModelClient = () =>
      Promise.resolve({ output: groundedRecap("Geno Smith threw for 412 yards."), costUsd: null });
    const failing = await main([...args, "--force", "--model", "sonnet"], {
      log: memoryLog(),
      dataDir: DATA_DIR,
      contentDir,
      client: () => bad,
      env: {},
    });
    expect(failing).toBe(1);

    const broken: ModelClient = () => Promise.reject(new Error("Not logged in"));
    const log = memoryLog();
    expect(
      await main([...args, "--force"], {
        log,
        dataDir: DATA_DIR,
        contentDir,
        client: () => broken,
        env: {},
      }),
    ).toBe(1);
    expect(log.lines.join("\n")).toContain("Not logged in");
  });
});
