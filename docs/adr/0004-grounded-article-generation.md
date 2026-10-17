# ADR 0005: Articles are drafted by Claude and must pass a deterministic fact check

- Status: accepted (2026-10-12)

## Context

The site publishes a game recap, a division roundup and a next-game preview every week. Writing
them by hand every week is not sustainable for a one-person project, and AdSense rejects thin or
unreviewed machine-generated text. A language model can write fluent analysis, but fluency is not
accuracy: it can invent a number, a player or a play that never happened.

## Decision

- **Inputs are closed.** Each article is drafted only from a compact JSON bundle built from the
  week's committed data files. The model has no tools and runs from an empty folder, so the bundle
  is its only source.
- **A program, not a model, decides what ships.** `packages/writer/src/ground.ts` checks every
  number, every multi-word proper name and every play tag against the bundle, and requires a play
  tag on every sentence that claims a touchdown or turnover. A second model pass, the editor, fixes
  what the check flags, at most twice. An article that still fails is not written.
- **A human approves.** Articles arrive in the weekly bot pull request next to the data and go live
  only when the owner merges it. Each article page discloses the AI drafting and the checks.
- **Runs on the owner's subscription.** The writer calls the pinned `@anthropic-ai/claude-code` CLI
  in print mode, signed in with a long-lived subscription token (`CLAUDE_CODE_OAUTH_TOKEN`). The same
  command works locally and in GitHub Actions at no per-call cost. Model and effort are settings
  (default: Sonnet, high effort). Moving to a paid API key later is a configuration change, not a
  rewrite.
- **Unchanged data means no rewrite.** Each article stores a hash of its bundle and prompt version.
  The Friday and Saturday reruns skip any article whose inputs did not change.

## Consequences

- The check is deliberately conservative. It can reject a correct sentence, for example a player's
  first name that is not in the data; the editor pass and the prompt rules steer around that.
- The check covers numbers written as digits, multi-word names and play claims. It cannot verify
  numbers written as words, single-word names, or interpretation. That residue is what the owner's
  review is for.
- Weekly runs count against the owner's subscription usage limits; when usage is tight, skipping a
  week or switching to an API key are both one-setting changes.
