# @huddle/writer

Drafts the week's three articles (game recap, division roundup, next-game preview) from the data the
pipeline already wrote under `apps/web/src/data`, and lets an article exist only when a deterministic
checker finds nothing wrong with it.

## How an article is made

1. **Bundle** (`src/bundle.ts`): a compact JSON view of the week's files: the facts, the key plays and
   the names the article may use. The model sees nothing else.
2. **Draft** (`src/model.ts`): the pinned Claude Code CLI (`@anthropic-ai/claude-code`) runs in print
   mode with structured output, from an empty temporary folder with every tool, slash command and MCP
   server disabled. Prompts live in `src/prompts.ts`.
3. **Check** (`src/ground.ts`): every number, every multi-word proper name and every `[p:ID]` play tag
   must trace back to the bundle; each scoring or turnover claim in a recap needs a tag; the title,
   description and body must fit `ARTICLE_LIMITS`.
4. **Edit**: up to two editor passes receive the draft and the checker's findings. The article is
   written only when a pass comes back with zero violations; otherwise nothing is written and the
   command exits 1.
5. **Skip**: each article stores a hash of its bundle and the prompt version. When the hash is
   unchanged, the article is left alone and no model call is made. `--force` overrides this.

## Usage

```
pnpm writer [--season <yyyy> --week <n>|auto] [--type recap,division,preview] [--force]
            [--dry-run] [--model <name>] [--effort <level>] [--help]
```

| Flag              | Meaning                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `--season/--week` | Which week to write about. `--week auto`, or leaving both out, means the newest week in the manifest. |
| `--type`          | Which articles, comma-separated (default: all three).                                                 |
| `--force`         | Rewrite even when the data has not changed.                                                           |
| `--dry-run`       | Write the data bundles and prompts to `packages/writer/out/` without calling a model.                 |
| `--model`         | Claude model alias or name (default: `$HUDDLE_WRITER_MODEL` or `sonnet`).                             |
| `--effort`        | `low`, `medium`, `high`, `xhigh` or `max` (default: `$HUDDLE_WRITER_EFFORT` or `high`).               |
| `--help`          | Print the usage text.                                                                                 |

## Environment

| Variable                  | Purpose                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude subscription sign-in token the CLI runs with. Read from the repo's git-ignored `.env` locally; a repository secret in CI. Without it (or `ANTHROPIC_API_KEY`), a CI run logs a skip and exits 0. |
| `HUDDLE_WRITER_MODEL`     | Default for `--model`. An empty value means unset.                                                                                                                                                      |
| `HUDDLE_WRITER_EFFORT`    | Default for `--effort`. An empty value means unset.                                                                                                                                                     |

## Output

- Articles: `apps/web/src/content/articles/<season>/w<week>-<type>.md`, markdown with frontmatter
  that `ArticleFrontmatter` in `@huddle/shared` validates.
- Dry runs: `packages/writer/out/<season>-w<week>-<type>.txt`, the system and user prompts as sent.

## Tests

`pnpm exec vitest run packages/writer` runs against frozen fixture data and a stand-in CLI script;
nothing calls Claude.

## See also

- [Runbook: articles](../../docs/runbook.md#articles) for the week-to-week routine and creating the token.
- [ADR 0004: grounded article generation](../../docs/adr/0004-grounded-article-generation.md) for why it works this way.
