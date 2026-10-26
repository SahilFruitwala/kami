---
type: build
status: closed
assignee: sahil
phase: 1-engine
blocked-by: [06-discover-plan-search-triage.md]
---

# Discover: fetch, extract and verify evidence

## Scope

- Fetch step: the triaged URLs through the source cache; failures counted, never fatal.
- Extract ([spec §4.7](../spec.md#47-discover-extract)): batched worker calls over trimmed chunks, returning quotes with kind, sentiment, `strong`, `pays`, `names`, author and date.
- Verify ([spec §4.8](../spec.md#48-discover-verify)): pure exact/close matching in `src/lib/research/verify.ts`; close matches take the source's wording; failures dropped and counted; author handles hashed into `author_key` and discarded.

## Done when

- Tests for verify: exact after normalising (NFKC, curly quotes, whitespace, case, Markdown emphasis), close at the threshold, dropped below it; a made-up quote is never stored.
- Re-running extract on the same source adds no duplicate evidence.

## Resolution

- `src/lib/research/verify.ts` (pure): `verifyQuote(quote, page)`.
  - Exact: a substring after normalising both sides (NFKC, curly quotes and dashes, Markdown emphasis, list and quote markers, whitespace, case).
  - Close: a page window of the quote's word count sharing at least 90% of its words (sliding counts, linear in the page; ties go to the window aligned with the quote's first and last words). The page's own wording is stored.
  - Quotes outside 20–600 characters, or under 6 words for a close match, are dropped.
- `src/lib/research/evidence.ts` (pure):
  - `selectChunks`: 3,000-character chunks scored by pain words plus seed terms; at most 5 per page, in page order; a page that trips nothing still sends its first chunk.
  - `cleanNames`, `authorKey` (sha256 of site + handle; `u/` and `@` folded; deleted or anonymous gives null), `parsePostedAt` (plausible dates only).
- `src/lib/research-db.server.ts`: `insertEvidence` (on conflict do nothing, so re-extraction stores nothing twice) and `runEvidence`.
- `src/server/services/research/evidence.ts`:
  - `fetch` step: one unit per picked page, through the source cache. An unreadable page is skipped and listed in `progress.skippedUrls`, never retried. Firecrawl out of credits, a rejected key or a missing key fails the run instead of skipping every page.
  - `extract` step: one unit per batch of up to 12 chunks or 24k characters across pages, each labelled `S1…` in a `<document source=… site=…>`. Every returned quote is verified against its stored page before storing; unknown labels and quotes not on the page count as `progress.dropped`. Sentiment is clamped, names cleaned, authors hashed, and the date falls back to the page's.
  - Discover now runs search → triage → fetch → extract.
- Change from the spec: verify runs inside each extract unit rather than as its own step, so unchecked quotes never need storing. spec.md updated.
- Tests: `tests/research-verify.test.mjs`, `tests/research-evidence.test.mjs` and `tests/db/research-evidence.test.mjs`:
  - an unreadable page is skipped;
  - the trimmed page is what's sent;
  - an exact quote, a near-miss (stored in the page's words) and a price quote are kept, while a made-up quote and a wrong label are dropped;
  - re-extracting from scratch stores nothing new and is answered from the model cache;
  - Firecrawl out of credits fails the run.
- `tests/db/research-discover.test.mjs` now runs only search and triage. Full suite with the DB: 411 pass.
