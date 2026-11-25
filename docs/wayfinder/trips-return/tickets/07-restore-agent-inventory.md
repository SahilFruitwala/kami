---
type: research
status: closed
assignee:
blocked-by: []
---

# What exactly was removed with the trip agent, and what has to change to restore it?

## Question

Read git history for commit c406d8c9 (and its parent): list every trip-agent file, route, hook and prompt (trip-agent.ts, trip-chat.tsx, trip-agent-prompt.ts, trip-models.ts, trip-undo.ts, chat and undo routes, ai-trips), what each depended on that has since changed (AI SDK v7 API, rate limits, AI status gating, schema), the tables it used, and an estimate of what restoring would take. Report findings only; do not restore anything.

## Resolution

Research report (subagent, read-only; git history). Source to restore from: `c406d8c9^` = `da0aff10` (no tags; 58 commits since).

Removed: `src/server/services/trip-agent.ts` (607 lines; `streamText`, 8-step cap, 6 Firecrawl calls per turn, 16 history messages, 200 stored per trip, tools), `trip-undo.ts` (one snapshot per trip, whole-trip JSON, restore in one transaction, latest turn only), `ai-trips.ts` + `api/ai/articles/$id/trip.ts` (plan from an article; stays out of scope), `api/trips/$id/chat.ts` (GET/POST/DELETE) and `undo.ts`, `lib/trip-agent-prompt.ts`, `lib/trip-models.ts` (split into `lib/ai-models.ts`, still present), `components/trips/trip-chat.tsx` (473 lines, `useChat`) and `chat-text.tsx`, `scripts/trip-agent.test.mjs`. Edited: `lib/api/trips.ts`, `hooks/use-trips.ts`, `routes/trips/$id.tsx` (was a 5/7 chat-plus-board grid), `package.json` (dropped `@ai-sdk/react`), `rate-limit.server.ts` (the `agent` bucket, 40/hour, fail-closed).

Agent tools: `update_trip` (title, destination, dates, days, travellers, budget, preferences), hotel shortlist/update/remove, `set_day` (replaces a day, up to 20 items), item add/update/remove, plus `web_search` and `read_page` via Firecrawl limited to user-pasted URLs. All writes go through the same `trips.ts` service functions as the board.

What changed since: `llm.server.ts` was rewritten (only `aiLanguageModel()` with an `AI_MODELS` fallback chain and `aiConfigured()`; the per-user model picker and `resolveTripModel` are gone); `pickModel` is gone; `firecrawl.server.ts` lost `searchWeb` and `readPage`; the request schemas moved to `lib/api/schemas/trips.ts`; routes need `routeTree.gen.ts` regenerated; tests belong in `tests/`; the `agent` rate bucket and the `@ai-sdk/react` dependency need re-adding. `ai` is `^7.0.133` and the old code already used the v7 API, to be confirmed by compiling. No new migration is needed: the tables and `0013`/`0014` are still there. Gate the chat on `aiConfigured`.

Estimate: 1-2 days for chat, undo and routes (revert, re-add dependency and rate bucket, rebuild the model choice, fix imports, restore Firecrawl search and read), plus half a day for tests and a dev check.

Questions this raises for the behaviour ticket: restore Firecrawl web research or drop it; per-user model picker or the single `AI_MODELS` chain; whether the agent may change `status`.
