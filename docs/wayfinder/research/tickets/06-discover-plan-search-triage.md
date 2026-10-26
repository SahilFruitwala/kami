---
type: build
status: closed
assignee: sahil
phase: 1-engine
blocked-by: [03-run-orchestrator.md, 04-fetch-and-source-cache.md, 05-model-tiers-and-cache.md]
---

# Discover: plan, search and triage

## Scope

- Plan drafting ([spec §4.4](../spec.md#44-discover-plan)): writer call with seed, filters, existing idea titles and recent queries; plan validation and repeat flagging in pure code (`query_norm`).
- Search and triage ([spec §4.5](../spec.md#45-discover-search-and-triage)): one search per checked query, dedupe by `url_key`, drop sources the topic already has, code filter and signals, batched worker triage, top `pagesToRead[depth]` saved to the run's `progress`.
- Record each sent query in `research_queries`.

## Done when

- Tests: plan validation (caps, include/exclude sites, repeats); the code filter; triage resumes without re-searching.

## Resolution

- `migrations/0024_research_query_hits.sql`: `research_queries.hits` (jsonb) keeps each search's results with its query, so triage reads stored results and a resumed run never searches again.
- `src/lib/research/discover.ts` (pure):
  - `DEPTH_LIMITS` (start values): quick 12 queries × 8 results, 12 pages to read, 40 triage candidates; deep 25 × 15, 40 pages, 120 candidates.
  - `validatePlan(plan, input, depth, sent, "draft" | "edited")`: trims and caps queries; normalises sites; moves an inline `site:` into `site`; drops excluded sites (and non-included ones when `includeSites` is given) and duplicates; caps at `maxQueries`; marks repeats (unchecked in a draft, the user's choice once edited).
  - `screenResults` drops files, video and login-walled sites, excluded sites, duplicates and pages the topic already has, then ranks the rest by `scoreResult` (pain words, questions, thread or review pages; listicles score low), stable on ties, capped at `maxCandidates`.
- `src/lib/research-db.server.ts`: `topicQueryNorms`, `recentTopicQueries`, `insertRunQuery`, `runQueries`, `liveIdeaTitles`.
- `src/server/services/research/discover.ts`:
  - `discoverDrafter`: one writer call with the seed, filters, live idea titles (as an untrusted `<document>`) and recent queries. Not budget-checked, since nothing is reserved yet: the output cap bounds it, and its tokens are charged if the run starts. It refuses when nothing new is left to search.
  - `validateEditedPlan`: for the start route (ticket 11); returns 400 when nothing is checked.
  - `search` step: one unit per checked query, each sent once, results stored.
  - `triage` step: the code screen, then one worker call per batch of at most 40 candidates, with result text in a `<document>`; each batch is one unit; it ends with the best `pagesToRead` picks in `progress.toRead`.
  - `discoverSteps(deps)` is a factory so tests inject fakes, and the live steps are registered for `discover`.
- Known edge: if a link is pasted into the topic while a run is mid-triage, the candidate list can shift between batches. The model cache makes a redone batch free; worth revisiting only if it shows up.
- Tests: `tests/research-discover.test.mjs` (plan validation, screening and ranking) and `tests/db/research-discover.test.mjs` (a draft flags a repeat and records the plan's tokens; a run handed off after every unit sends each checked query exactly once, triages stored results with one model call, picks 4 of 5 candidates best first, and charges 6 Firecrawl credits plus tokens = 7; an edited plan with nothing checked is refused). Full suite with the DB: 397 pass.
