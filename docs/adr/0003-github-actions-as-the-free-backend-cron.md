# ADR 0003: GitHub Actions is the only scheduler ("backend cron")

- Status: accepted (2026-09-30)

## Context

Firebase's free Spark plan cannot deploy Cloud Functions, and the site must stay on free tiers.
Weekly data ingestion, article generation, pick settlement and leaderboard builds all need a trusted
scheduled runtime.

## Decision

Scheduled GitHub Actions workflows on the public repository (free minutes) run the TypeScript jobs.
Data and articles land as a bot pull request that the owner approves with one click; jobs that touch
Firestore run with `firebase-admin` and write public results as static JSON to S3 so pages never read
Firestore.

## Consequences

- Cron runs can be delayed or dropped and are auto-disabled after 60 days of repository inactivity:
  every job is idempotent, business rules (like pick lock time) are enforced by Firestore security
  rules rather than by the schedule, and a keep-alive step re-enables the workflow on each run.
- Bot PRs must be opened with a GitHub App token, not `GITHUB_TOKEN`, or CI never runs on them.
- No machine-written prose is ever published without a human approval (AdSense policy).
