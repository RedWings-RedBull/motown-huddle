#!/usr/bin/env node
/** Conventional Commits check for PR titles (squash merges reuse the title). */
const title = process.argv[2] ?? "";
const re =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|data|content)(\([a-z0-9._-]+\))?!?: .{1,72}$/;
if (!re.test(title)) {
  console.error(`PR title does not follow Conventional Commits: "${title}"`);
  console.error(
    "Expected e.g. `feat(web): field heat map island` or `data(2026-w04): provisional Huddle Grades`.",
  );
  process.exit(1);
}
console.log("PR title ok");
