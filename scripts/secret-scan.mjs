#!/usr/bin/env node
/**
 * Belt-and-braces secret scan for the pre-push hook. CI runs the real gitleaks action; this
 * catches the common shapes before they leave the machine. Exit 1 on any hit.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "GitHub token", re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/ },
  { name: "Private key block", re: /-----BEGIN (RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/ },
  { name: "Google service account", re: /"private_key_id"\s*:\s*"[0-9a-f]{40}"/ },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
];

const ALLOW = [/^scripts\/secret-scan\.mjs$/, /^pnpm-lock\.yaml$/];

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((f) => f && !ALLOW.some((re) => re.test(f)));

let hits = 0;
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\u0000")) continue; // binary
  for (const { name, re } of PATTERNS) {
    const m = re.exec(text);
    if (m) {
      const line = text.slice(0, m.index).split("\n").length;
      console.error(`${file}:${line}: possible ${name}`);
      hits += 1;
    }
  }
}

if (hits > 0) {
  console.error(
    `\nsecret-scan: ${hits} finding(s). Remove them (and rotate if real) before pushing.`,
  );
  process.exit(1);
}
console.log(`secret-scan: ${files.length} tracked files clean`);
