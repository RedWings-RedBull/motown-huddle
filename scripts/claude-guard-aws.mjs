#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook for the Bash tool.
 *
 * Refuses shell commands whose executable is the AWS CLI or the CDK CLI unless the command is
 * explicitly pinned to the personal AWS profile. The machine's default profile is NOT this
 * project's account. Only the first token of each command segment is inspected, so file contents
 * written through heredocs never trigger it.
 *
 * Exit code 2 blocks the tool call and shows stderr to the agent.
 */
import { readFileSync } from "node:fs";

const REQUIRED_PROFILE = process.env.HUDDLE_AWS_PROFILE ?? "huddle";
const GUARDED = new Set(["aws", "cdk"]);
const RUNNERS = new Set([
  "npx",
  "pnpx",
  "pnpm",
  "yarn",
  "bunx",
  "exec",
  "dlx",
  "sudo",
  "time",
  "command",
]);

let payload = "";
try {
  payload = readFileSync(0, "utf8");
} catch {
  process.exit(0);
}

let command = "";
try {
  const json = JSON.parse(payload);
  command = String(json?.tool_input?.command ?? "");
} catch {
  process.exit(0);
}

const pinned = new RegExp(`--profile[ =]${REQUIRED_PROFILE}(\\s|$)`);

/** Split on newlines and shell operators; heredoc bodies become harmless "segments". */
const segments = command.split(/\r?\n|;|&&|\|\||\||\(|\)/);

for (const segment of segments) {
  const tokens = segment.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i += 1;
  while (i < tokens.length && RUNNERS.has(tokens[i])) i += 1;
  const executable = tokens[i];
  if (!executable || !GUARDED.has(executable)) continue;
  if (pinned.test(segment)) continue;
  process.stderr.write(
    `Blocked: "${executable}" commands must include --profile ${REQUIRED_PROFILE}. ` +
      `This project never deploys through the default AWS profile.\n`,
  );
  process.exit(2);
}
process.exit(0);
