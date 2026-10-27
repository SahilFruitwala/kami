---
type: build
status: closed
assignee:
phase: 2-product
blocked-by: [02-research-credits.md]
---

# Research home, topics and nav

## Scope

- Routes `GET /api/research/status`, `/credits`, `/topics` (list, create, get, rename, delete) per [spec §6](../spec.md#6-api).
- `src/routes/research/index.tsx` and `src/routes/research/$topicId.tsx` (shell with Ideas, Sources and Runs tabs), per [spec §7](../spec.md#7-ui).
- Nav entry in `site-header.tsx` after Trips and at the end of the phone scroller, shown only when `status.enabled`.
- Credit balance and ledger display, styled like the Listening card.

## Done when

- With research unconfigured the nav entry and routes are hidden or 404; with 0 credits the page shows and Run is disabled.
- Owner scoping: another user's topic 404s (test).

## Resolution

Built on `research/phase-2`. `GET /api/research/status`, `/credits`, `/topics` (list, create, get, rename, delete) in `src/server/services/research/topics.ts`; every route but `status` is a 404 while Research is off, and deleting a topic is refused while a run in it is working. `/research` (start cards, credits panel with history, topics list) and `/research/$topicId` (Ideas, Sources and Runs tabs, rename and delete). The nav entry sits after Trips (last on phones) and shows only when `status.enabled`. Tested in `tests/db/research-product.test.mjs`: the off state, and another user's topic, ideas and sources are 404s.
