# Runbook

## Weekly data workflow

`.github/workflows/weekly-data.yml` runs on Tuesday (provisional grades) and on Friday and Saturday
(final grades), and can be started by hand from the Actions tab. One run rebuilds everything the site
reads: the latest game's breakdown, the roster, the next-game preview, the division page, Coach's
Corner and the game-highlights link. It then opens a pull request with the changes under
`apps/web/src/data`. Nothing merges without the owner's approval. The PR body lists whether each
page rebuilt; a page whose step failed keeps the previous week's data.

### One-off setup: the GitHub App that opens the PRs

Pull requests opened with the workflow's built-in `GITHUB_TOKEN` never trigger CI, so the workflow
signs in as a small GitHub App instead.

1. Account **Settings** → **Developer settings** → **GitHub Apps** → **New GitHub App**. Any unique
   name; homepage URL = the repository URL; untick **Webhook → Active**.
2. **Repository permissions**: Contents = Read and write, Pull requests = Read and write. Leave
   everything else at No access. **Where can this app be installed?** Only on this account.
3. After creating it, copy the **Client ID** from the app's General page, then **Generate a private
   key** (a `.pem` file downloads).
4. **Install App** → this account → **Only select repositories** → this repository.
5. Store both values in the repository:

   ```powershell
   gh variable set HUDDLE_APP_CLIENT_ID --repo <owner>/<repo> --body "<client id>"
   Get-Content -Raw "<path to .pem>" | gh secret set HUDDLE_APP_PRIVATE_KEY --repo <owner>/<repo>
   ```

6. Delete the downloaded `.pem` (or move it into a password manager), then start the workflow from
   the Actions tab to confirm it opens a PR.

To rotate, generate a new private key on the app page, update the secret, and delete the old key.

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

## Game highlights

```bash
pnpm pipeline --highlights --season 2026 --week auto
```

Writes `apps/web/src/data/<season>/week-<nn>/game-highlights.json`: the league's official
game-highlights video for that game, shown as a card under the score that opens YouTube (the league
blocks playback of its videos on other sites). One `search.list` call per game, restricted to the
league's channel and the seven days after kickoff. A result is accepted only when its title has both
clubs' full names, the words "Game Highlights" and the right week number, and no preview or recap
wording; otherwise nothing is guessed and the card shows a YouTube search link until a later run
(Tuesday or Friday) finds the video.

- Needs `HUDDLE_YOUTUBE_API_KEY`, a YouTube Data API v3 key from a Google Cloud project (no billing).
  Locally it goes in `.env` at the repo root, which the pipeline reads; on GitHub it is a repository
  secret. Without a key the command keeps whatever the file already has.
- A found video is never dropped by a later empty search. Setting `"source": "manual"` pins a
  hand-picked video; the command then never searches for that game again.
- The card's thumbnail comes from YouTube's image host, so Lighthouse's cache-lifetime and
  image-compression audits are warnings in `lighthouserc.json`: those headers and bytes are YouTube's.

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
