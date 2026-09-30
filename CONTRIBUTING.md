# Contributing

Thanks for looking. This is a solo portfolio project that happens to be open, so the bar is
"would a reviewer be happy to read this diff".

## Local setup

```bash
pnpm install
pnpm dev              # Astro dev server
pnpm test:watch       # unit tests in watch mode
pnpm verify           # the full CI gate: secrets, format, lint, typecheck, depcruise, knip, coverage, build, e2e, lighthouse
```

`pnpm verify:quick` (secrets, lint, typecheck, unit) runs on every `git push` through a pre-push
hook installed by `simple-git-hooks`.

## Conventions

- **Conventional Commits** for PR titles (squash merges reuse them): `feat(web): …`,
  `fix(pipeline): …`, `data(2026-w04): …`.
- One PR per feature or milestone, with a written description of what and why.
- Tests live next to the code they cover; behaviour changes come with test changes.
- Decisions a future reader would question get an ADR in `docs/adr/`.
- Never commit secrets, private notes or league-wide raw data. `.gitignore` and the secret scan help,
  but the rule is on you.

## Architecture rules (enforced by `dependency-cruiser`)

- `apps/web` imports only `@huddle/shared` from the workspace.
- `packages/grades` is pure: no I/O, no Node built-ins.
- Packages never import from apps.

## Fork it for your team

Change `packages/shared/src/team.config.ts`. Everything else reads from it.
