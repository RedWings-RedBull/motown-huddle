# ADR 0001: Astro static output with React islands

- Status: accepted (2026-09-30)

## Context

The site is content-heavy (weekly articles, data pages) with a few genuinely interactive pieces
(field heat map, picks game). It must be served from S3 + CloudFront as plain files, index well for
search and AdSense review, and score well on Lighthouse.

## Decision

Astro 7 with `output: "static"`, `trailingSlash: "always"` and directory-style builds. Interactive
components are React islands hydrated only where needed (`client:visible` / `client:only`). Content
collections load the pipeline's committed JSON and the MDX articles through zod schemas shared with
the pipeline, so a bad artifact fails the build instead of rendering wrong.

## Consequences

- Zero client JavaScript on pages without islands; charts that need no interaction are rendered as
  SVG at build time.
- Clean URLs need a CloudFront viewer-request function to map `/x/` to `/x/index.html`.
- No server runtime: anything dynamic goes through Firebase (client) or GitHub Actions (jobs).
