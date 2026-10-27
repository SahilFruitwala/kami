---
type: build
status: open
assignee: sahil
phase: 1-engine
blocked-by: [08-idea-matching-and-scoring.md]
---

# Debug page and tuning on real seeds

## Scope

- A bare page (operator-only, e.g. `/research/debug` behind a feature flag in `user_feature_flags`) to draft, edit, start and watch a Discover run and dump its plan, triage list, sources, evidence (with dropped count) and ideas with sub-scores.
- Run at least 5 real seeds at both depths. Tune and write down: Quick/Deep caps and budgets, the Firecrawl cost table, `RESEARCH_TOKENS_PER_CREDIT`, the close-match threshold, triage size, score weights. Note the cache hit rate on a second run of the same seed.
- Update every _(start)_ value in `spec.md` with what was chosen and why, and close the matching items in the map's "Not yet specified".

## Done when

- Five seeds produce ideas you'd act on, each with checked quotes, inside their budgets. Actual cost per Quick and Deep run is recorded here.

## Checkpoint (2026-10-26): in progress, waiting on a decision

Where to pick up: branch `research/09-debug` (stacked on `research/08-ideas`, PR #87). Not pushed and no PR yet.

**Built so far**

- Debug page `/research/debug` (`src/routes/research/debug.tsx`) and its API under `/api/research/debug/*` (`src/server/services/research/debug.ts`, types in `src/lib/api/research.ts`). Gated by `RESEARCH_DEBUG_EMAILS` (404 for everyone else) instead of a `user_feature_flags` column, so no migration.
- Terminal tuning scripts in [`../tuning/`](../tuning/README.md), for when the page can't be reached signed in.
- Fixes found by real runs (see the run table in `../tuning/README.md`):
  - The plan prompt requires a `site` per query (`discover-plan-v2`, `planSite`).
  - Firecrawl 429 waits and retries, following `Retry-After` (`src/lib/research/backoff.ts`); retries are free. Step time budgets went to 120/150 s and `LEASE_MS` to 300 s.
  - A failed run shows the source's own message (`PageReadError`, `src/lib/page-read-error.ts`).
  - A topic's stored search for the same query within 14 days is reused for free (`SEARCH_REUSE_DAYS`, `storedTopicHits`, `progress.reusedSearches`).
  - Quick budget is 45 (was 30).
  - Firecrawl 403 means "this site isn't supported" (`422`, skipped), and only 401 means a bad key.
  - Hacker News goes through the free Algolia API for search and reading (ticket 18, closed).
  - A Reddit `.json` reader exists (`src/lib/reddit.server.ts`), **but Reddit refuses unauthenticated reads (403)**, so it reads nothing today.

**Findings**

- Firecrawl does not scrape reddit.com. Reddit's public JSON also refuses this client. Don't work around that with browser-like User-Agents: that's circumventing a bot check.
- Triage picked only Reddit threads (discussion pages score highest), and a skipped pick isn't replaced, so the last run read nothing.
- Spend so far: 26 research credits across the runs. Local balance is about 174 of 200.

**Open decision (the user's)**

1. Until Reddit can be read, keep Reddit threads out of triage picks, and backfill a skipped pick with the next-best candidate, so runs read pages they can get (HN, review sites, forums). Recommended now.
2. Add Reddit's official API with app-only OAuth (`REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` from a "script" app at reddit.com/prefs/apps), used only when set. Needs the user to create the app. Recommended alongside 1.

**Then**

- Re-run the indie-podcasters plan; it should be nearly free, since its searches are stored.
- Then 4 more seeds at both depths, asking before each run that spends credits.
- Record real costs, the cache hit rate, the close-match threshold and the score weights here and in `spec.md`.

## Resolution
