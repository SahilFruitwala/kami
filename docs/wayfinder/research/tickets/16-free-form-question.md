---
type: build
status: closed
assignee:
phase: 3-validate
blocked-by: [15-validate-report.md]
---

# Ask a question

## Scope

- `kind = question` runs with the same draft → start flow and a report without fixed sections ([spec §5.2](../spec.md#52-free-form-question-ticket-16)); enable the "Ask a question" start card.

## Done when

- A question produces a cited report in its topic, with the same claim checks as Validate.

## Resolution

Built on `research/phase-3`, sharing ticket 15's code (`src/server/services/research/validate.ts`).

- `POST /api/research/runs` takes `kind: "question"` (default stays `discover`); the seed is the question. The "Ask a question" start card opens the same form with question wording.
- The plan has no counter requirement. The report has no fixed sections: the writer picks 2–5, and the same label resolution, unsupported marking and empty-answer note apply (`resolveReport` without `fixed`).
