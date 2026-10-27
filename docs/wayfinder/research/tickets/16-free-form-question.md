---
type: build
status: closed
assignee: cursor
phase: 3-validate
blocked-by: [15-validate-report.md]
---

# Ask a question

## Scope

- `kind = question` runs with the same draft → start flow and a report without fixed sections ([spec §5.2](../spec.md#52-free-form-question-ticket-16)); enable the "Ask a question" start card.

## Done when

- A question produces a cited report in its topic, with the same claim checks as Validate.

## Resolution

- `kind = question` on `POST /api/research/runs` with `{ question, topicId?, depth }`; the question is the run's seed so a new topic is named after it.
- Same draft → start flow as Discover; search → extract, then a writer drafts free-form sections of claims. `assembleQuestionReport` checks every cited id (unknown ids dropped, empty claims marked unsupported) and always stores at least one section.
- UI: "Ask a question" start card on `/research` and on a topic; the run page and Reports tab show the cited answer.
