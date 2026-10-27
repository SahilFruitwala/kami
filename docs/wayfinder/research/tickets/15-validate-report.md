---
type: build
status: closed
assignee:
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

Built on `research/phase-3`.

- `research_reports` (migration 0025): one per run, `body` = sections of claims `{ text, evidenceIds[], unsupported?, note? }`.
- `kind = validate` runs start from an idea ("Validate this idea" in the idea sheet, `POST /api/research/ideas/:id/validate`, which drafts the plan and opens the plan screen). Plan intents gained `counter`; the drafter asks for counter-evidence searches and code tops the plan up to at least 2 (`ensureCounterQueries`). Starting a Validate run with fewer than 2 checked counter searches is a 400.
- Steps: `search`, `triage`, `fetch`, `extract` (reused from Discover), then `report` (final, so it runs when the run is stopped). One writer call sees up to 60 quotes (the idea's own plus every quote on the pages the run read) labelled E1…; code resolves labels to stored evidence ids and marks claims with none as unsupported (`src/lib/research/report.ts`, tested).
- The counter-evidence section is never empty: with no supported counter claim it adds a note naming the searches. With no quotes at all the report is stored without a model call; if the budget is gone the report is a partial one built in code.
- Reports tab on the topic page, a report page (`/research/reports/$reportId`) with each claim's quotes under it, and a link from the finished run. Validate and question runs no longer count as a topic's "last run" for idea badges.
- Not done: Validate's _Existing solutions_ reading from Players (comes with ticket 17); no engine test with fakes because this machine has no Postgres, so the `report` step is checked by the pure tests and types only.
