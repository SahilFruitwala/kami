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

- Three seeds at Quick and a Deep check produce ideas you'd act on, each with checked quotes, inside their budgets (reduced from five seeds at both depths to save credits). Actual cost per Quick and Deep run is recorded here.

## Checkpoint (2026-10-27): tuning runs done

Where to pick up: branch `research/09-debug` (stacked on `research/08-ideas`, PR #87), pushed to origin at `e711798a`; no PR for it yet (target `research/08-ideas`).

**Decision made: Reddit** (both parts built)

- Until Reddit can be read, triage leaves Reddit threads out and the rest of its ranked picks are kept as `progress.spares`; a page the fetch step skips is replaced by the best spare.
- Reddit's official API with app-only OAuth, used only when `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` are set. **No keys yet:** Reddit now approves API access (Responsible Builder Policy) before an app can be created. Add the keys when approved; no code change needed.

**Built so far**

- Debug page `/research/debug` and its API (`src/server/services/research/debug.ts`), gated by `RESEARCH_DEBUG_EMAILS`.
- Terminal tuning scripts in [`../tuning/`](../tuning/README.md) and a run table there.
- Fixes found by real runs: plan `site` per query, 429 wait-and-retry, stored-search reuse (14 days), Quick budget 45, Firecrawl 403 = unsupported site, Hacker News via Algolia, Reddit gate and spares, extract capped at 5 quotes per block / 40 per call (`discover-extract-v2`, 8,000 output tokens), match batches of 15 (6,000 tokens), cut-off model answers saved to `<tmpdir>/kami-research-cutoffs/`, and idea titles that carry their summary are split (`ideaText`).

**First real end-to-end run** (`77cd5966`, Quick, topic "tools for indie podcasters"): 12 stored searches reused free; 12 pages read (5 Indie Hackers, 3 HN, 3 G2, 1 other); 115 exact quotes, 0 dropped; 32 ideas, none broken after the naming pass. Charged **13 credits** in total (9 Firecrawl, 4 model tokens) across 4 resumes after failures that are now fixed, so a clean Quick run on stored searches costs roughly that. A first run with fresh searches also pays for them (the earlier runs spent 21 credits on 10 of 12 searches).

**Measured on real runs (2026-10-27)**

| Run                                 | Depth | Searches          | Pages read | Quotes (dropped) | Ideas | Charged                     |
| ----------------------------------- | ----- | ----------------- | ---------- | ---------------- | ----- | --------------------------- |
| Seed 1, invoicing (`438dd6f3`)      | Quick | 12 (11 paid)      | 11         | 131 (0)          | 37    | 36 (33 Firecrawl, 3 tokens) |
| Seed 2, home lab (`5fd625e6`)       | Quick | 12 (10 paid)      | 8          | 65 (0)           | 17    | 30 (28 Firecrawl, 2 tokens) |
| Podcasters (`77cd5966`)             | Quick | 12 (stored, free) | 12         | 115 (0)          | 32    | 13 (9 Firecrawl, 4 tokens)  |
| Invoicing plan at Deep (`a6955991`) | Deep  | 12 (stored, free) | 28         | 235 (1)          | +40   | 35 (28 Firecrawl, 7 tokens) |

- A Quick run with fresh searches costs **30–38**; on stored searches about **13**. Deep on stored searches costs about **35**; with 20 fresh searches add up to 40 (2 each), so about **75–85**, inside its 100 budget.
- Cache: a re-run of a plan in the same topic reuses every search and every stored page for free (`a6955991` reused 12 of 12 searches and skipped the 11 pages already read). The separate cache re-run was skipped to save credits.
- Triage picks fewer pages than allowed when results are thin (8–12 of 12 at Quick, 29 of 40 at Deep).
- Score weights tuned (spec §4.9). Quote matching: 99.4% exact; the close-match threshold stays as is.
- Model answers can loop at temperature 0; an unusable answer is now retried once, 0.3 warmer.

**Scope change (agreed 2026-10-27):** to save Firecrawl and model credits, ticket 09 ends at 3 seeds at Quick plus a Deep check on one of them, instead of 5 seeds at both depths.

**Left before closing:** a broad idea can soak up quotes ("Getting paid and reconciling is hard" holds 76): watch it in the ideas tab (ticket 12, merging and splitting). Commit and open the PR.

## Resolution
