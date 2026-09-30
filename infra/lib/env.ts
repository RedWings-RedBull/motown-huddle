import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo-root .env, resolved relative to this file so it works from any cwd. */
const DEFAULT_ENV_FILE = path.resolve(here, "../../.env");

/** Parse KEY=VALUE lines (comments and blanks skipped, surrounding quotes stripped). */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key && value !== "") out[key] = value;
  }
  return out;
}

/** Minimal .env loader (no dependency): fills missing process.env keys from the file if present. */
export function loadDotEnv(file = DEFAULT_ENV_FILE, env: NodeJS.ProcessEnv = process.env): void {
  if (!existsSync(file)) return;
  for (const [key, value] of Object.entries(parseDotEnv(readFileSync(file, "utf8")))) {
    if (!(key in env)) env[key] = value;
  }
}

export function requireAccountId(env: NodeJS.ProcessEnv = process.env): string {
  const account = env.HUDDLE_AWS_ACCOUNT_ID;
  if (!account || !/^\d{12}$/.test(account)) {
    throw new Error(
      "HUDDLE_AWS_ACCOUNT_ID must be a 12-digit AWS account id (see .env.example). " +
        "Refusing to synthesize without an explicit account pin.",
    );
  }
  return account;
}
