---
type: build
status: closed
assignee: sahil
phase: 1-engine
blocked-by: []
---

# Research tables, schema and glossary

## Scope

- `migrations/0023_research.sql` with the v1 tables in [spec §3.1–3.5](../spec.md#3-data-model): `research_credit_entries`, `research_topics`, `research_runs`, `research_queries`, `research_sources`, `research_topic_sources`, `research_evidence`, `research_ideas`, `research_idea_evidence`, `research_model_cache`. Header comment in the style of 0020/0021.
- Mirror them in `src/lib/schema.ts`.
- `src/lib/research-db.server.ts` with the basic owner-scoped reads and writes the other tickets need.
- Add the `### Research` vocabulary from [spec §2](../spec.md#2-vocabulary) to `GLOSSARY.md`.

## Done when

- `pnpm db:migrate` applies cleanly on an empty and an existing database; typecheck passes.
- Unique keys hold: `(user_id, url_key)` on sources, `(topic_id, source_id, md5(quote))` on evidence.

## Resolution

- `migrations/0023_research.sql`: the ten v1 tables with CHECK lists mirroring `src/lib/research/kinds.ts` (new: the shared vocabularies and jsonb shapes: `DiscoverInput`, `PlanQuery`, `RunProgress`, `IdeaScore`).
- `src/lib/schema.ts`: matching Drizzle tables under `// ---------- Research ----------` (not in the `schema` object, like the narration tables).
- `src/lib/research-db.server.ts`: owner-scoped topics (list with live idea count and last run, get, create, rename, touch, delete), runs (create in `drafting`, get, list) and the source cache (`sourcesByUrlKey`, `upsertSource` updating in place, `linkTopicSource`, `topicUrlKeys`). Credits are left to ticket 02.
- `GLOSSARY.md`: `### Research` section; Operator now also grants research credits.
- Change from the spec: `research_ideas.score_total` (real) is copied out of `score` for sorting and indexing, instead of indexing `score->>'total'`. spec.md updated.
- `research_model_cache` is not per user: its key is a hash of the full input, so a hit only returns the answer to identical input.
- Verified: migration applied to the existing local DB and to a fresh empty DB (all 23 migrations); `tests/db/research.test.mjs` covers owner scoping, one source per `(user_id, url_key)` updated in place, the evidence quote unique index, and topic delete keeping the cache. All DB tests and the full suite (292) pass; typecheck, lint and Prettier clean.
