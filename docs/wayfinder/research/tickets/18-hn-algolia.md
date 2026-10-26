---
type: build
status: open
assignee:
phase: 4-explore
blocked-by: [14-docs-and-adr.md]
---

# Hacker News via the Algolia API

## Scope

- A free search source for HN stories and comments (`hn.algolia.com/api/v1`), used by Discover and Validate plans for queries targeting HN instead of Firecrawl `site:` search. Comments become sources with real authors, dates and points; points can feed Frequency later.
- Costs 0 research credits; still rate limited.

## Done when

- HN queries in a plan spend no Firecrawl credits and produce checked evidence.

## Resolution
