---
type: build
status: closed
assignee:
phase: 2-product
blocked-by: [09-debug-page-and-tuning.md, 10-research-home-and-topics.md]
---

# Ideas, Sources and Runs tabs

## Scope

- Routes: ideas list, idea detail, `PATCH` idea, `POST /ideas/merge` (moves evidence, marks `merged`, rescores), topic sources.
- Ideas tab: cards with sub-score bars, competition label, counts, New / +N badges; status filter; star, dismiss, reopen, rename, multi-select merge.
- Idea detail sheet: each sub-score with its quotes; quotes link to the source and show site, date and `close` marks.
- Sources and Runs tabs ([spec §7](../spec.md#7-ui)).

## Done when

- Merge and dismiss survive the next run (test); a renamed idea keeps its name after the next run.

## Resolution

Built on `research/phase-2`: `GET /topics/$id/ideas?status=`, `GET`/`PATCH /ideas/$id`, `POST /ideas/merge` (moves evidence, marks the others `merged`, rescores the survivor in code), `GET /topics/$id/sources`. Ideas tab: cards with sub-score bars, the competition label, counts, New and +N badges from the latest finished run; Open / Starred / Dismissed filter; star, dismiss, reopen; select several to merge (into the best-scored). The idea sheet shows each sub-score with the quotes behind it, linked to their source with site, date and close-match marks, and renames (a rename is never undone by a run). Sources and Runs tabs. Tested in `tests/db/research-product.test.mjs`: a merge, a dismissal and a rename all survive the next run.
