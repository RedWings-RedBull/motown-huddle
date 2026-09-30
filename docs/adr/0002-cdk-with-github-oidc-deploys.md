# ADR 0002: AWS CDK in TypeScript, GitHub OIDC deploys, hard account pin

- Status: accepted (2026-09-30)

## Context

The whole repository is TypeScript; infrastructure should be readable in the same language and
testable without deploying. The developer machine's default AWS profile belongs to a different
account, so an accidental deploy there must be impossible.

## Decision

One CDK stack (`infra/lib/site-stack.ts`) with S3 + OAC, CloudFront, a clean-URL function,
security headers, two least-privilege GitHub OIDC roles (site deploy; jobs limited to `data/*`) and a
$1/month budget alarm. Production deploys run only from GitHub Actions via OIDC. Locally:

1. `bin/app.ts` throws unless `HUDDLE_AWS_ACCOUNT_ID` is set and pins `env.account`, so CDK itself
   refuses mismatched credentials.
2. Every infra npm script hard-codes `--profile huddle`, and `infra/scripts/preflight.ts` checks STS
   before `deploy`/`bootstrap` and rejects ambient `AWS_PROFILE`/access keys.
3. A Claude Code pre-tool hook (`scripts/claude-guard-aws.mjs`) blocks any `aws`/`cdk` shell command
   that is not pinned to the profile.

Until the Launch milestone, infra is exercised only by `cdk synth` and `aws-cdk-lib/assertions`
tests; nothing is deployed.

## Consequences

- Reviewers can read the entire hosting setup in one file and see it tested.
- No access keys exist anywhere: not in CI, not in the repo, not in the deploy role.
- The custom domain and certificate are added later behind a context value; the CloudFront URL works
  first.
