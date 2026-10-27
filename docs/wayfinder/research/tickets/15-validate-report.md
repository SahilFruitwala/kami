---
type: build
status: closed
assignee: cursor
phase: 3-validate
blocked-by: [14-docs-and-adr.md]
---

# Validate this idea

## Scope

- `research_reports` table; `kind = validate` runs started from an idea; plan with the required counter-evidence queries; report drafting with claims citing evidence ids, checked in code, uncited claims marked unsupported ([spec §5.1](../spec.md#51-validate-ticket-15)).
- Reports tab and a report page; "Validate this idea" button on idea cards and the detail sheet.

## Done when

- Every Validate report has a non-empty counter-evidence section, and every claim either cites real evidence or shows as unsupported.

## Resolution

- `migrations/0025_research_reports.sql` and `researchReports` in the schema: one report per run, `body` is sections of `{ text, evidenceIds[], unsupported? }`.
- Pure checks in `src/lib/research/report.ts` (tested): drop unknown ids and mark those claims unsupported; never leave the counter-evidence section empty (lists what was searched); required counter queries are merged into the drafted plan inside the depth cap.
- `src/server/services/research/validate.ts`: writer-tier plan (plus injected counter searches) and a final `report` step after Discover's search → extract. Claims cite `E1` labels; code maps them to ids and checks them against the topic.
- Product: `POST /api/research/runs` with `{ kind: "validate", ideaId, depth }`; `GET /api/research/topics/:id/reports` and `GET /api/research/reports/:id`.
- UI: Validate on idea cards and the idea sheet; Reports tab; `/research/reports/$reportId`; the run page shows the report instead of ideas.
