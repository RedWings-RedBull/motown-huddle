import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ModelClient, ModelRequest } from "../src/model.js";
import { runWriter } from "../src/run.js";
import { DATA_DIR, groundedRecap } from "./helpers.js";

/** A model stand-in that returns the queued answers in order and records each request. */
function scripted(answers: unknown[]): ModelClient & { requests: ModelRequest[] } {
  const requests: ModelRequest[] = [];
  const client = (request: ModelRequest) => {
    requests.push(request);
    const output = answers.shift();
    if (output === undefined) return Promise.reject(new Error("no more answers"));
    return Promise.resolve({ output, costUsd: 0.01 });
  };
  return Object.assign(client, { requests });
}

const base = () => ({
  dataDir: DATA_DIR,
  contentDir: mkdtempSync(join(tmpdir(), "huddle-articles-")),
  model: "sonnet",
  effort: "high",
  season: 2026,
  week: 3,
  types: ["recap"] as const,
  now: new Date("2026-10-12T12:00:00Z"),
});

describe("runWriter", () => {
  it("drafts, checks, has the editor fix the violations and writes the article", async () => {
    const bad = groundedRecap("Geno Smith threw for 412 yards.");
    const client = scripted([bad, groundedRecap()]);
    const opts = { ...base(), client };
    const result = await runWriter(opts);

    expect(result.failed).toEqual([]);
    expect(result.costUsd).toBeCloseTo(0.02);
    expect(client.requests).toHaveLength(2);
    // The editor sees the checker's findings.
    expect(client.requests[1]?.prompt).toContain('name or term not in the data: "Geno Smith"');
    const path = join(opts.contentDir, "2026", "w03-recap.md");
    expect(result.written).toEqual([path]);
    const md = readFileSync(path, "utf8");
    expect(md).toContain("type: recap");
    expect(md).toContain("passed: true");
    expect(md).toContain("[Q3 11:06](/games/2026/week-03/#play-2265)");
    expect(md).not.toContain("[p:");

    // Same data again: nothing to do, no model calls.
    const again = scripted([]);
    const second = await runWriter({ ...opts, client: again });
    expect(second.skipped).toEqual([path]);
    expect(again.requests).toHaveLength(0);

    // --force rewrites.
    const forced = scripted([groundedRecap(), groundedRecap()]);
    const third = await runWriter({ ...opts, client: forced, force: true });
    expect(third.written).toEqual([path]);
  });

  it("writes nothing when violations survive both editor passes", async () => {
    const bad = groundedRecap("Geno Smith threw for 412 yards.");
    const client = scripted([bad, bad, bad]);
    const opts = { ...base(), client };
    const result = await runWriter(opts);
    expect(client.requests).toHaveLength(3);
    expect(result.written).toEqual([]);
    expect(result.failed[0]?.violations).toContain('number not in the data: "412"');
    expect(existsSync(join(opts.contentDir, "2026", "w03-recap.md"))).toBe(false);
  });

  it("defaults to the newest week and all three article types", async () => {
    const client = scripted([]);
    const { season: _season, week: _week, types: _types, ...rest } = base();
    const opts = { ...rest, client };
    await expect(runWriter(opts)).rejects.toThrow(/no more answers/);
    expect(client.requests[0]?.system).toContain("game recap");
  });
});
