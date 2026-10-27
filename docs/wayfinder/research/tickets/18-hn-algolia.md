---
type: build
status: closed
assignee: sahil
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

Done early, during ticket 09's tuning: the first real run showed Firecrawl refuses Reddit, so free sources moved up.

- `src/lib/hackernews.server.ts`: Algolia search over stories and comments (one hit per discussion, the matching comment as the snippet, `created_at_i` window for `sinceMonths`), and discussion reading through the items API, rendered as one Markdown block per comment.
- `searchForRun` sends `site: news.ycombinator.com` queries to Algolia (no budget check, no charge); `getOrFetchSource` reads `news.ycombinator.com/item?id=…` pages through it. Both retry on 429.
- Comment points aren't in the items API, so they don't feed Frequency yet.
- Tests: `tests/hackernews.test.mjs` and `tests/db/research-fetch.test.mjs`.
