/**
 * Calls Claude through the Claude Code CLI in print mode, so the same command works on the owner's
 * machine and in GitHub Actions with a subscription sign-in token (CLAUDE_CODE_OAUTH_TOKEN). The CLI
 * runs from an empty temporary folder with every tool, slash command and MCP server disabled, so
 * the only context is the system prompt and the data passed on stdin.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { z } from "zod";

export interface ModelRequest {
  system: string;
  prompt: string;
  schema: object;
}

export interface ModelResponse {
  output: unknown;
  costUsd: number | null;
}

export type ModelClient = (request: ModelRequest) => Promise<ModelResponse>;

export interface ClaudeCodeOptions {
  model: string;
  effort: string;
  /** Executable and leading arguments; defaults to the pinned @anthropic-ai/claude-code binary. */
  command?: { file: string; args: string[] };
  timeoutMs?: number;
}

/** The binary shipped by the pinned @anthropic-ai/claude-code dev dependency. */
export function claudeBinary(): string {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("@anthropic-ai/claude-code/package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { bin: Record<string, string> };
  return join(dirname(pkgPath), pkg.bin.claude ?? "bin/claude.exe");
}

const CliResult = z.object({
  type: z.literal("result"),
  subtype: z.string(),
  is_error: z.boolean(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
  total_cost_usd: z.number().optional(),
});

/** Pulls the JSON object out of the CLI result, preferring structured output. */
export function parseCliOutput(stdout: string): ModelResponse {
  const lines = stdout.trim().split("\n");
  const raw = CliResult.parse(JSON.parse(lines.at(-1) ?? ""));
  if (raw.is_error || raw.subtype !== "success") {
    throw new Error(`Claude Code returned ${raw.subtype}: ${(raw.result ?? "").slice(0, 300)}`);
  }
  const cost = raw.total_cost_usd ?? null;
  if (raw.structured_output !== undefined) return { output: raw.structured_output, costUsd: cost };
  const text = raw.result ?? "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Claude Code returned no JSON object");
  return { output: JSON.parse(text.slice(start, end + 1)) as unknown, costUsd: cost };
}

export function claudeCodeClient(options: ClaudeCodeOptions): ModelClient {
  return (request) =>
    new Promise((resolve, reject) => {
      const command = options.command ?? { file: claudeBinary(), args: [] };
      const cwd = mkdtempSync(join(tmpdir(), "huddle-writer-"));
      const args = [
        ...command.args,
        "-p",
        "--output-format",
        "json",
        "--model",
        options.model,
        "--effort",
        options.effort,
        "--system-prompt",
        request.system,
        "--json-schema",
        JSON.stringify(request.schema),
        "--tools",
        "",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--no-session-persistence",
      ];
      const child = spawn(command.file, args, { cwd, env: process.env, windowsHide: true });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Claude Code timed out after ${String(options.timeoutMs ?? 600_000)} ms`));
      }, options.timeoutMs ?? 600_000);
      child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        rmSync(cwd, { recursive: true, force: true });
        if (code !== 0 && stdout.trim() === "") {
          reject(new Error(`Claude Code exited ${String(code)}: ${stderr.slice(0, 300)}`));
          return;
        }
        try {
          resolve(parseCliOutput(stdout));
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
      child.stdin.end(request.prompt);
    });
}
