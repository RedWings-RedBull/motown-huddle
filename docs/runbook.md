# Runbook

## Roster

```bash
pnpm pipeline --roster --season 2026
```

Rebuilds `apps/web/src/data/roster/current.json` from nflverse weekly rosters, injuries and
`players.csv` (specific position and NGS role). Deterministic; commit the result.

## Next-game preview

```bash
pnpm pipeline --preview --season 2026
```

Rebuilds `apps/web/src/data/preview/next.json` for the team's next scheduled game: schedule row
(kickoff, venue, line, rest, quarterbacks, coaches), season-to-date offense and defense splits for both
teams with league ranks over every completed regular-season week, the current injury report for both
teams, and the last five meetings. "Next" means the first kickoff after the time the command runs, so
rerun it after each game. Deterministic for a given schedule state; commit the result.

## Division page

```bash
pnpm pipeline --division --season 2026
```

Rebuilds `apps/web/src/data/division/current.json`: standings for the team's division with the NFL
tiebreaking steps applied (the step that settled a place is recorded as `resolvedBy`), division and
playoff odds from a seeded 10,000-run simulation of the remaining schedule, season-to-date efficiency
for all four clubs, and the coming week's games. Deterministic for a given schedule state; commit the
result. The seed lives in `packages/pipeline/src/division/build.ts`.

## Coach's Corner

```bash
pnpm pipeline --coach --season 2026
```

Rebuilds `apps/web/src/data/coach/current.json`. The head coach is whoever the schedule lists for the
team's latest completed game. Play-by-play is loaded from the coach's first season (at most five
seasons back) through the current one, keeping only fourth downs, first downs, punts and field
goals. Outputs: the Fourth-Down Aggression Index per season with the current league ranking, every
fourth-down decision this season scored by the calculator, the empirical calculator tables, and the
era record from the schedule. Deterministic; commit the result.

Quotes live in `apps/web/src/data/coach/quotes.json` (at most ten, each with a date, context, source
name and source URL; the schema rejects anything else). The section is hidden while the list is empty.

## Highlight clips

```bash
pnpm pipeline --highlights --season 2026 --week auto
```

Writes `apps/web/src/data/<season>/week-<nn>/highlights.json`: the official game-highlights video
plus one single-play clip per key play (Shorts included) where the league, either club or a league
broadcaster posted one. Each plays in place through a click-to-play facade: nothing loads from
YouTube until the reader presses play, then the privacy-enhanced player (youtube-nocookie.com) is
inserted. Matching is deterministic: player names parsed from the play description, several query
phrasings per play, a 48-hour window after kickoff, an official-channel allowlist, keyword and
yardage scoring, and the clip's publish time checked against the game clock. The three best
candidates per play are kept in the file for review.

Each chosen video is then loaded in headless Chromium (Playwright) to learn whether YouTube lets it
play on other sites. The league blocks embeds of its own and the clubs' uploads; broadcaster uploads
usually play. The file records `embeddable`; the page plays those in place and opens the rest on
YouTube under the same "Watch the play" control.

The facade thumbnails are hotlinked from YouTube's image host, so Lighthouse's cache-lifetime and
image-compression audits (`uses-long-cache-ttl`, `cache-insight`, `image-delivery-insight`) are
warnings rather than errors in `lighthouserc.json`: those headers and bytes are YouTube's, and the
alternative, committing league imagery into a public repository, is not an option. Run `pnpm --filter @huddle/pipeline exec playwright
install chromium` once locally before using the command.
The step runs in `weekly-data.yml` after the week build and may fail without blocking the PR.

- Needs `HUDDLE_YOUTUBE_API_KEY`, a YouTube Data API v3 key from a Google Cloud project (no billing).
  Locally it goes in `.env`; on GitHub it is a repository secret. One game costs about a dozen
  `search.list` calls, well inside the free daily allowance.
- Without a key the command still writes the file with the search fallback and keeps what is there.
- Entries with `"source": "manual"` are never overwritten: fix a wrong link by editing the JSON and
  setting that field. API entries are replaced on every run.
- The links point at third-party videos the league can delist; the weekly rerun refreshes the
  current week only.

## Socials

Social links live in `apps/web/src/data/players_socials.json`, keyed by `gsis_id`. The site renders
a link only when `verified` is `true`, so nothing from an automated source can misattribute an
account to a player.

1. Seed candidates (X and Instagram usernames from Wikidata, CC0):

   ```bash
   pnpm --filter @huddle/pipeline seed:socials
   ```

   Seeded entries carry `"verified": false` and `"source": "wikidata"`; manual entries are never
   overwritten.

2. Verify by hand: open the account, confirm it is the player's own (team bio, verified badge,
   recent content), then set `"verified": true`, `"source": "manual"` and today's date in
   `"checked"`. Add other platforms the same way (`tiktok`, `youtube`, `bluesky`).

3. A `null` link means "confirmed none"; a missing key means "not researched yet".

Never scrape team or league sites for handles; their terms forbid systematic retrieval.
