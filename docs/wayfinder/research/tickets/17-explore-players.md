---
type: build
status: closed
assignee: cursor
phase: 4-explore
blocked-by: [15-validate-report.md]
---

# Explore: Players

## Scope

- `research_players` and `research_player_evidence`; Players created from evidence `names` and from `kind = explore` runs; homepage and pricing fetch and a worker call to fill the fields from those pages only ([spec §5.3](../spec.md#53-explore-ticket-17)).
- Players tab (sortable table grouped by category); enable the "Map a space" start card; Validate's Existing solutions section reads from Players.

## Done when

- Names in evidence turn into Players without duplicates (normalised `name_key`); every Player field traces to a fetched page.

## Resolution

- `migrations/0026_research_players.sql`: `research_players` unique on `(topic_id, name_key)`, `research_player_evidence` linking quotes. Evidence `names` upsert stubs (no duplicates after folding Inc/LLC/case).
- Explore runs (`kind = explore`) search for best tools / alternatives / directories, then fetch each Player's homepage and `/pricing` and a worker fills `one_liner`, `category`, `audience`, `pricing` and `free_plan` from those pages only.
- UI: Map a space start card; Players tab (sortable, grouped by category); Validate's empty Existing solutions section lists Players and cites their linked evidence.
