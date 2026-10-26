---
type: build
status: open
assignee:
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

## Resolution
