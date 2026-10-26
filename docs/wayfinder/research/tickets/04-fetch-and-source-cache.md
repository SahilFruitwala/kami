---
type: build
status: closed
assignee: sahil
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

- Firecrawl billing checked against its docs: a search costs 2 credits per 10 results, rounded up; a scrape costs 1. Responses carry `creditsUsed` (top level, or `data.metadata` for scrapes); the client charges that and falls back to the cost table.
- `src/lib/firecrawl.server.ts` (research section): `researchSearch` (up to 20 results, `tbs` date window for `sinceMonths`), `researchScrape` (main-content Markdown, no PDF parser since PDFs bill per page), `searchCreditCost`, `parseCreditsUsed`, and pure request and response helpers. `parseSearchResponse` gained an optional cap; the trip agent's `MAX_SEARCH_RESULTS = 8` and `MAX_PAGE_CHARS` are unchanged.
- `src/lib/research/sources.ts` (pure): `urlKey` (Reddit hosts folded, thread slug and case dropped; `www.`, fragments, trailing slashes and tracking params dropped; query sorted), `siteOf`, `inferSourceKind`, `isReadableUrl` (skips PDFs and other files), `SOURCE_FRESH_DAYS` and `isSourceFresh`, `trimPageMarkdown`, and `chunkMarkdown` (paragraph-packed, splitting overlong paragraphs at sentence ends). Trimming removes link and image lists and short boilerplate, and turns inline links into their text. The trimmed text is what gets stored, so quotes are later checked against exactly that.
- `src/server/services/research/fetch.ts`:
  - `searchForRun` checks the budget against `limit` results, then charges the reported cost.
  - `getOrFetchSource` reuses a fresh cached copy (no call, no charge) and links it to the topic. Otherwise it checks the budget, scrapes, charges, trims, caps at `RESEARCH_MAX_PAGE_CHARS` and upserts in place, so the source keeps its id and evidence.
  - Firecrawl calls are injectable for tests.
- Chunking is pure and ready for extraction (ticket 07). Picking which chunks to send (the code filter around comment and review blocks) is left to tickets 06 and 07, where the signals live.
- Tests: `tests/research-sources.test.mjs`, new cases in `tests/firecrawl.test.mjs`, and `tests/db/research-fetch.test.mjs` (a cache hit makes no Firecrawl call and costs nothing; a stale copy is re-read into the same row; the budget is checked before every paid call; PDFs are refused without spending; searches are checked at their worst case and charged the reported cost). Full suite with the DB: 374 pass.
