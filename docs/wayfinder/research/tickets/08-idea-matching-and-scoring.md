---
type: build
status: open
assignee:
phase: 1-engine
blocked-by: [07-extract-and-verify.md]
---

# Discover: idea matching and scoring

## Scope

- `match.ts` as an interface (`matchEvidence(topicId, evidence[]) → assignments`) with the model implementation from [spec §4.9](../spec.md#49-discover-match-ideas-then-score): batches of 40, live ideas capped at 150, dismissed ideas by title; quotes on dismissed ideas attach quietly; in-batch new ideas merged by normalised title; one writer call per run to tidy new idea names. User-renamed ideas are never renamed.
- `src/lib/research/score.ts`: the five sub-scores, the competition label and the weighted total, all pure.
- Score step: rescore every idea the run touched; set `last_run_id`, `added_last_run`, `first_run_id`.

## Done when

- Tests: every sub-score and the total on fixed evidence; competition label cases; a second run adds to existing ideas instead of duplicating; dismissed stays dismissed; merged ideas are excluded from matching.

## Resolution
