import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { claudeBinary, claudeCodeClient, parseCliOutput } from "../src/model.js";

const result = (extra: object) =>
  JSON.stringify({ type: "result", subtype: "success", is_error: false, ...extra });

describe("parseCliOutput", () => {
  it("prefers structured output and reports cost", () => {
    const out = parseCliOutput(result({ structured_output: { title: "t" }, total_cost_usd: 0.02 }));
    expect(out).toEqual({ output: { title: "t" }, costUsd: 0.02 });
  });

  it("falls back to the JSON object inside the text result", () => {
    const out = parseCliOutput(
      `noise\n${result({ result: 'Here you go:\n```json\n{"title":"t"}\n```' })}`,
    );
    expect(out).toEqual({ output: { title: "t" }, costUsd: null });
  });

  it("throws on errors and on results without JSON", () => {
    expect(() =>
      parseCliOutput(
        JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true, result: "x" }),
      ),
    ).toThrow(/error_max_turns/);
    expect(() => parseCliOutput(result({ result: "no json here" }))).toThrow(/no JSON/);
  });
});

/** A stand-in CLI: echoes its arguments and stdin back as structured output. */
function fakeCli(body: string): { file: string; args: string[] } {
  const dir = mkdtempSync(join(tmpdir(), "fake-claude-"));
  const script = join(dir, "fake.mjs");
  writeFileSync(script, body);
  return { file: process.execPath, args: [script] };
}

describe("claudeCodeClient", () => {
  it("runs the CLI with tools off and the model settings, passing the prompt on stdin", async () => {
    const command = fakeCli(`
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  const args = process.argv.slice(2);
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false,
    structured_output: { args, input, cwd: process.cwd() } }));
});`);
    const client = claudeCodeClient({ model: "sonnet", effort: "high", command });
    const res = await client({ system: "SYS", prompt: "DATA", schema: { type: "object" } });
    const out = res.output as { args: string[]; input: string; cwd: string };
    expect(out.input).toBe("DATA");
    expect(out.args).toEqual(
      expect.arrayContaining([
        "-p",
        "--model",
        "sonnet",
        "--effort",
        "high",
        "--system-prompt",
        "SYS",
        "--tools",
        "",
      ]),
    );
    expect(out.args[out.args.indexOf("--json-schema") + 1]).toBe('{"type":"object"}');
    expect(out.cwd).toContain("huddle-writer-");
  });

  it("rejects when the CLI fails without output or prints an error result", async () => {
    const crash = claudeCodeClient({
      model: "m",
      effort: "e",
      command: fakeCli(
        `process.stdin.resume(); process.stdin.on("end", () => { console.error("boom"); process.exit(3); });`,
      ),
    });
    await expect(crash({ system: "", prompt: "", schema: {} })).rejects.toThrow(/exited 3: boom/);

    const error = claudeCodeClient({
      model: "m",
      effort: "e",
      command: fakeCli(
        `process.stdin.resume(); process.stdin.on("end", () => console.log(JSON.stringify({ type: "result", subtype: "error_during_execution", is_error: true, result: "Not logged in" })));`,
      ),
    });
    await expect(error({ system: "", prompt: "", schema: {} })).rejects.toThrow(/Not logged in/);
  });

  it("rejects on timeout and when the executable is missing", async () => {
    const slow = claudeCodeClient({
      model: "m",
      effort: "e",
      timeoutMs: 200,
      command: fakeCli(`setTimeout(() => {}, 10000);`),
    });
    await expect(slow({ system: "", prompt: "", schema: {} })).rejects.toThrow(/timed out/);
    const missing = claudeCodeClient({
      model: "m",
      effort: "e",
      command: { file: join(tmpdir(), "no-such-claude-binary"), args: [] },
    });
    await expect(missing({ system: "", prompt: "", schema: {} })).rejects.toThrow();
  });

  it("locates the pinned CLI binary", () => {
    expect(claudeBinary()).toMatch(/claude-code.+claude(\.exe)?$/);
  });
});
