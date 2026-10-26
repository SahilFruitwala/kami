---
type: build
status: open
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
