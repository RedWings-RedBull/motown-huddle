# Security policy

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** on this repository (Security tab → "Report a
vulnerability"). Do not open a public issue for security problems.

You can expect an acknowledgement within a few days. Fixes ship as normal pull requests once a patch is
ready; credit is given in the release notes unless you prefer otherwise.

## Scope

- The static site, the data pipeline, the Firestore security rules and the GitHub Actions workflows in
  this repository.
- Secrets never live in the repo: production deploys use GitHub OIDC, and a `gitleaks` scan runs in CI
  and in the pre-push hook.
