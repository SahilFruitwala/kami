---
type: build
status: open
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
