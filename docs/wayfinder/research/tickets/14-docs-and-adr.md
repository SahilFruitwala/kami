---
type: build
status: closed
assignee:
phase: 2-product
blocked-by: [11-discover-plan-and-run-ui.md, 12-ideas-tab.md, 13-paste-a-link.md]
---

# Docs and ADR for v1

## Scope

- Update `docs/ARCHITECTURE.md` (Research section), `docs/DATA-MODEL.md`, `docs/API.md`, `README.md` scripts table, `.env.example` per [spec §10](../spec.md#10-docs-to-update-when-v1-lands).
- New ADR: quote-level evidence checked in code, and scores computed in code rather than by the model.

## Done when

- A new contributor can enable Research, grant credits and run Discover from the docs alone.

## Resolution

`docs/ARCHITECTURE.md` (Research: turning it on, the steps, cost and caching, code map), `docs/DATA-MODEL.md` (the `research_*` tables), `docs/API.md` (every research route), `README.md` (`pnpm research:grant`, `/research`), `.env.example` (research and Reddit lines), and [ADR 0002](../../../adr/0002-research-evidence-and-scores-in-code.md): quote-level evidence checked in code, scores computed in code.
