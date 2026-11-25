---
label: wayfinder:map
---

# Map: Trips return

## Destination

A locked, implementation-ready spec for bringing Trips back as a planning-only, standalone feature with a stored trip status, from which the build can run in separate implementation sessions.

## Notes

- Domain: Kami's Trips (`src/components/trips`, `src/server/services/trips.ts`, `src/routes/api/trips`, migrations `0012`-`0015`). Vocabulary lives in `GLOSSARY.md` (Trip, Trip status); update it as terms resolve.
- Grilling tickets use `/grilling` and `/domain-modeling`, one question at a time, recommendation first.
- Plan, don't do: no feature code is written on this map.
- The existing code is sound: typecheck clean, 257 tests pass. The feature is only hidden in the nav (`site-header.tsx`).

## Decisions so far

- Nav: Trips is a top-level pill, order Home, Library, Shelves, Trips, Vault. Feeds and Extracts stay hidden. (settled while naming the destination)
- Trips are standalone: no link to saved articles. In `GLOSSARY.md`.
- ~~Drop legacy tables~~ Reversed: the AI trip planner (chat agent plus undo) comes back, so `trip_messages` and `trip_snapshots` stay. Restored from git history (removed in `c406d8c9`), shown only when an AI model is configured, writing into the same board. The manual board stays.
- Trip status is stored: `planning` (default), `booked`, `done`, `archived`. Set by hand, any direction, independent of dates. In `GLOSSARY.md`.
- `done` and `archived` trips stay fully editable.
- Trips are for planning only: no print view, share link, or offline use. `.ics` stays the only export. (AI planning is in; see above.)
- [Does the phone bottom tab bar fit a fifth item?](tickets/04-phone-tab-bar-fit.md): no, it already overflows at 7 tabs; layout choice is the phone-bar-layout ticket.
- [Which phone bottom-bar layout carries Trips?](tickets/06-phone-bar-layout.md): keep the scroller, Trips in third slot, narrower tabs plus an edge fade; no 5-slot restructure.
- [What does a trip status change besides grouping?](tickets/02-status-effects.md): nothing; status is a plain label, no gating, no rules, only list grouping.
- [Do archived trips count toward the 50-trip limit?](tickets/01-archived-trip-limit.md): no; 50 active trips and a separate 200 archived, with the target group's cap checked when status crosses the archive boundary.
- [What exactly was removed with the trip agent, and what has to change to restore it?](tickets/07-restore-agent-inventory.md): restore from `da0aff10`; about 1.5-2.5 days; `llm.server.ts`, Firecrawl search/read, the `agent` rate bucket and `@ai-sdk/react` need rebuilding; no migration needed.
- [What may the trip agent change, and how do undo and limits work?](tickets/08-agent-behaviour.md): web research restored; no model picker (shared `AI_MODELS` chain); agent never touches status; old edit scope, one-reply undo and limits kept.
- [How do the list grouping and the board's status control look and behave?](tickets/03-list-and-board-ui.md): variant B refined: Planning, Booked and Done tabs with counts, quiet Archived link, "+ New trip" opens an inline form then the new board, status menu on each card and in the board header.

## Not yet specified

- Undo after a manual edit (warn or refuse), settled during the build.
- Model choice and per-user cost limits for the trip agent (after the behaviour ticket).
- Migration of the restored agent code to the current AI SDK and server layout.
- Test plan for status rules and the restored agent (specifiable once the status-rules tickets close).
- Doc updates (`ARCHITECTURE.md` currently says "no chat agent", plus `DATA-MODEL.md`, `API.md`) once the shape is final.
- Whether the list's status grouping and the archived toggle persist in the URL or local prefs.

## Out of scope

- Sharing, printing, and offline use: ruled out.
- Planning a trip from a saved article (stays out: trips never refer to articles).
- Feeds and Extracts returning to the nav.
- Restructuring the phone bar into fixed slots with a Shelves sheet.
