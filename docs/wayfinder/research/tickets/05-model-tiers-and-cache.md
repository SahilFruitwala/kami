---
type: build
status: open
assignee:
phase: 1-engine
blocked-by: [01-schema-and-glossary.md, 03-run-orchestrator.md]
---

# Model tiers, batching and answer cache

## Scope

- `src/server/services/research/models.ts` per [spec §4.3](../spec.md#43-model-tiers-and-calls): worker tier (`AI_MODELS`), writer tier (`RESEARCH_WRITER_MODELS`, falling back to the worker chain), structured output with zod, prompt version strings.
- `research_model_cache` lookups by sha256 of model id + prompt version + input; hits charge nothing; prune rows older than 30 days at run end.
- Token accounting onto the run, and the budget guard from ticket 03 before every call.
- A batching helper (split items into calls by count and character limit).

## Done when

- Tests: cache hit skips the model and the charge; a call that would exceed the budget is refused before it's made; writer falls back to worker when unset.

## Resolution
