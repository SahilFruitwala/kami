---
type: build
status: closed
assignee: sahil
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

- `src/lib/research/score.ts` (pure): `scoreIdea` with the five sub-scores and weights from spec §4.9.
  - Frequency counts anonymous quotes as half a person.
  - Recency is 0.5 when nothing is dated, meaning unknown rather than old.
  - Competition is a label: none, some (1–2 products), crowded (3+), or crowded but disliked (3+ and at least half the naming quotes negative). It stays out of the total.
  - Values are rounded to 3 decimals; the weights live in `SCORE_WEIGHTS`.
- `src/lib/research/match.ts` (pure): `resolveAssignments` turns a matcher's answer into attachments and new ideas.
  - A dismissed idea's quote attaches quietly.
  - A proposed title equal (once normalised) to an existing idea's or another proposal's joins it rather than duplicating.
  - A quote with no usable answer stays unmatched: still evidence, just not in an idea.
- `src/lib/research-ideas-db.server.ts`: live and dismissed ideas for matching (merged ideas excluded), the run's matchable evidence in a fixed order, create, attach, rename (model-named ideas only), touched ideas, evidence for scoring, save score.
- `src/server/services/research/ideas.ts`:
  - The `Matcher` interface, with `modelMatcher` as the implementation: worker tier, 40 quotes per call, up to 150 live and 100 dismissed ideas, all as untrusted `<document>` text.
  - `match` step: 40 quotes per unit, by offset into the run's evidence, so a resume continues at the next batch, and a redone batch neither duplicates ideas nor moves quotes.
  - `name` step: one writer call that renames up to 40 of the run's new ideas from a few of their quotes.
  - `score` step (final): rescores every idea the run created or added to, setting `last_run_id`, `added_last_run` and the progress counts `ideasNew` and `ideasTouched`.
  - Discover is now complete: search → triage → fetch → extract → match → name → score.
- Change from the spec: idea naming is its own `name` step (not final), so a stopping run keeps the matcher's names and still scores. spec.md updated.
- Tests: `tests/research-score.test.mjs`, `tests/research-match.test.mjs`, and `tests/db/research-ideas.test.mjs`, which covers two runs with a fake model:
  - run 1 creates three named, scored ideas; a competitor quote isn't made into an idea;
  - after dismiss, rename and merge, run 2 adds to editing and noise without duplicating them, keeps noise dismissed, keeps the user's name, never shows the merged idea to the matcher, and creates one new idea;
  - renaming only touches model-named ideas.
- Full suite with the DB: 425 pass.
