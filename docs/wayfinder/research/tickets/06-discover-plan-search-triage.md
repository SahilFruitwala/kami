---
type: build
status: open
assignee:
phase: 1-engine
blocked-by: [03-run-orchestrator.md, 04-fetch-and-source-cache.md, 05-model-tiers-and-cache.md]
---

# Discover: plan, search and triage

## Scope

- Plan drafting ([spec §4.4](../spec.md#44-discover-plan)): writer call with seed, filters, existing idea titles and recent queries; plan validation and repeat flagging in pure code (`query_norm`).
- Search and triage ([spec §4.5](../spec.md#45-discover-search-and-triage)): one search per checked query, dedupe by `url_key`, drop sources the topic already has, code filter and signals, batched worker triage, top `pagesToRead[depth]` saved to the run's `progress`.
- Record each sent query in `research_queries`.

## Done when

- Tests: plan validation (caps, include/exclude sites, repeats); the code filter; triage resumes without re-searching.

## Resolution
