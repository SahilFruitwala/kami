---
type: build
status: closed
assignee:
phase: 2-product
blocked-by: [09-debug-page-and-tuning.md, 10-research-home-and-topics.md]
---

# Find ideas flow, plan screen and run view

## Scope

- Routes: `POST /api/research/runs`, `…/start`, `…/stop`, `GET …/runs/$id`.
- Find ideas form (seed, More options, topic picker, depth, Skip review) → plan screen (check, edit, add, remove queries; repeats unchecked; estimate and balance; Run) → run view at `/research/runs/$runId` with live step counters (2 s poll), partial ideas, Stop, and the final spend split ([spec §7](../spec.md#7-ui)).

## Done when

- A run can be drafted, edited, started, watched, stopped and finished from the UI, on desktop and phone; stopped and empty runs explain themselves.

## Resolution

Built on `research/phase-2`: `POST /api/research/runs` (draft), `…/start`, `…/stop`, `GET …/runs/$id` in `src/server/services/research/product.ts`, with a cost estimate per depth (`estimateRun`: paid searches, pages, measured token cost, capped at the budget). Find ideas form (seed, More options, topic, depth, Skip review) on `/research` and on a topic; the run page `/research/runs/$runId` shows the plan screen (check, edit, add, remove; repeats unchecked; estimate and balance; Run disabled without enough credits; Discard), then live steps polled every 2 s, ideas as soon as `match` has output, Stop, why a stopped or empty run ended, and the spend split. Checked signed in on desktop (1280 px) and phone (375 px) without a paid run: a plan drafted from a stored plan was edited (untick, add, remove, depth) and discarded; finished, stopped and discarded runs read correctly. Fixes from that check: the estimate is recomputed as the plan changes (`src/lib/research/estimate.ts`, free repeats at the low end); a plan discarded before it ran says so; the phone tab bar scrolls the current page into view; Merge floats above the tab bar while ideas are selected; checkboxes and score bars use the persimmon accent.
