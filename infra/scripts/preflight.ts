/**
 * Refuse to run any infra command unless the resolved AWS identity is the personal account.
 * Layers: (1) the `huddle` named profile is mandatory, (2) STS account must equal
 * HUDDLE_AWS_ACCOUNT_ID, (3) ambient credentials/profiles are rejected outright.
 */
import { execFileSync } from "node:child_process";

import { loadDotEnv, requireAccountId } from "../lib/env.js";

const PROFILE = "huddle";

function fail(message: string): never {
  console.error(`\n\u001b[31mPREFLIGHT FAILED\u001b[0m ${message}\n`);
  process.exit(1);
}

loadDotEnv();
const expected = requireAccountId();

if (process.env.AWS_PROFILE && process.env.AWS_PROFILE !== PROFILE) {
  fail(
    `AWS_PROFILE is set to "${process.env.AWS_PROFILE}". Unset it; only --profile ${PROFILE} is allowed.`,
  );
}
if (process.env.AWS_ACCESS_KEY_ID ?? process.env.AWS_SECRET_ACCESS_KEY) {
  fail(
    "Ambient AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are set. Unset them; only the named profile is allowed.",
  );
}

let identity: { Account?: string; Arn?: string } = {};
try {
  const out = execFileSync(
    "aws",
    ["sts", "get-caller-identity", "--profile", PROFILE, "--output", "json"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  identity = JSON.parse(out) as { Account?: string; Arn?: string };
} catch (error) {
  const first =
    error instanceof Error ? (error.message.split("\n")[0] ?? "unknown error") : "unknown error";
  fail(
    `Could not resolve the "${PROFILE}" profile (${first}). Create it with: aws configure sso --profile ${PROFILE}`,
  );
}

if (identity.Account !== expected) {
  fail(
    `Profile "${PROFILE}" resolves to account ${identity.Account ?? "?"}, expected ${expected}. Not deploying.`,
  );
}

console.log(`preflight ok: ${identity.Arn ?? "?"} (account ${expected}, profile ${PROFILE})`);
