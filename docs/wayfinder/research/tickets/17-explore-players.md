---
type: build
status: open
assignee:
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
