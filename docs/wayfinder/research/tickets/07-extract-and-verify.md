---
type: build
status: open
assignee:
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
