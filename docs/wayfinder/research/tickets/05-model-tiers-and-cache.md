---
type: build
status: closed
assignee: sahil
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

- `src/lib/llm.server.ts`: `researchModel("worker" | "writer")`. Worker is the `AI_MODELS` chain. Writer is `RESEARCH_WRITER_MODELS` when it names a model whose provider has a key, else the worker chain. Returns the chain's model and an `id` (its model ids, comma-joined) for caching. `aiLanguageModel` now shares a `chainModel` helper; its behaviour is unchanged.
- `src/lib/research/model-calls.ts` (pure): `batchItems` (in order, by item count and characters; an oversized item gets its own batch), `modelCacheKey` (sha256 of model chain + prompt version + input in key-sorted JSON), `estimateTokens` (about 3 chars per token, deliberately high for budget checks).
- `src/lib/research-model-cache-db.server.ts`: `cachedAnswer`, `storeAnswer`, `pruneModelCache` (30 days).
- `src/server/services/research/models.ts`: `callModel(meter, { tier, schema, promptVersion, instructions, prompt, maxOutputTokens })`.
  - The cache comes first: a hit makes no call, needs no budget check and costs nothing.
  - Otherwise the budget is checked with estimated input tokens plus `maxOutputTokens`, then the call is made with the same settings as `generateJson` (the untrusted-content guard, reasoning off, one retry), and the run is charged the provider's reported usage.
  - An off-schema answer is charged but not cached, and fails the unit with a `RunStepError`; provider failures become the same user-facing messages as the library AI. The provider call is injectable for tests.
- `Meter` moved to `runs.ts`, where both fetch and models use it. `endRun` prunes the model cache.
- Tests: `tests/research-model-calls.test.mjs` (batching, cache key, estimate, tiers and writer fallback) and `tests/db/research-models.test.mjs` (a cache hit skips the model and the charge; a call that wouldn't fit is refused before it is made; off-schema answers are charged but not cached; provider errors are mapped; prune). Full suite with the DB: 388 pass.
- For prompts in tickets 06–08: wrap page text in `asDocument(...)` from `src/server/ai.ts`.
