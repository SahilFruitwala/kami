---
type: build
status: open
assignee:
phase: 1-engine
blocked-by: [01-schema-and-glossary.md]
---

# Firecrawl research client and source cache

## Scope

- Research variants in `src/lib/firecrawl.server.ts` (or `src/server/services/research/fetch.ts`): search with its own result cap and `tbs`, scrape with `RESEARCH_MAX_PAGE_CHARS`. Leave the trip agent's `MAX_SEARCH_RESULTS` and `MAX_PAGE_CHARS` unchanged.
- Report the Firecrawl credits each call costs to the run (from the response when Firecrawl returns it, else the cost table in [spec §4.10](../spec.md#410-budgets-and-estimates-start-values)).
- `url_key` normalising and source-kind inference as pure functions in `src/lib/research/`.
- Cache: reuse a source when fresher than its kind's limit ([spec §4.6](../spec.md#46-discover-fetch)); otherwise scrape and upsert by `(user_id, url_key)`.
- Page trimming: strip nav, footers, banners and link lists; split into chunks around comment and review blocks.

## Done when

- Tests for `url_key` (Reddit `old.`/`np.`, `www.`, tracking params, fragments), kind inference, freshness, trimming.
- A cache hit makes no Firecrawl call and is charged nothing.

## Resolution
