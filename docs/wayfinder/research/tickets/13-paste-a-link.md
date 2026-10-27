---
type: build
status: closed
assignee:
phase: 2-product
blocked-by: [08-idea-matching-and-scoring.md, 10-research-home-and-topics.md]
---

# Paste a link

## Scope

- `POST /api/research/topics/$id/links` per [spec §4.11](../spec.md#411-paste-a-link): fetch as a source (`added_by = link`), then extract → verify → match → score as a small run with its own small budget.
- "Paste a link" field on the topic page; the run appears in Runs.

## Done when

- Pasting a page with real complaints adds checked evidence to existing or new ideas; pasting the same URL again reuses the cached source and adds nothing new.

## Resolution

Built on `research/phase-2`: `POST /api/research/topics/$id/links` creates a small run (`input.link`, no plan, starting at `fetch`, budget `LINK_BUDGET` = 5) that reads the page as a `link` source and then extracts, matches, names and scores. "Paste a link" field on the topic page opens the run. Tested in `tests/db/research-product.test.mjs`: the first paste adds a checked quote to a new idea; pasting the same URL again reads the cached page (no Firecrawl call) and stores nothing new.
