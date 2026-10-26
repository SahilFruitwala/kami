# Spec: Research

Status: agreed design, not built. Decisions and their reasons are in [map.md](map.md); this file is what to build. Numbers marked _(start)_ are starting values to tune in [ticket 09](tickets/09-debug-page-and-tuning.md).

## 1. What it is

A section of Kami at `/research` for finding and checking product ideas. Discover reads what real people say online (Reddit, Hacker News, review sites, Product Hunt) and turns their complaints into ranked ideas. Validate tries to knock an idea down with a cited report. Explore keeps a table of the products already in the space. All three write into one Topic, and every claim points at a stored quote that code has checked against its page.

Principles, in priority order:

1. **Evidence or nothing.** No claim without a checked quote; nothing a model makes up is shown as fact.
2. **Spend little, and say what was spent.** Every run has a budget, an estimate before and an actual after.
3. **Code does the arithmetic.** Models read and classify language; counting, scoring, deduping and checking are plain code.
4. **Work builds up.** Topics, ideas, sources and players get better with each run instead of being regenerated.

## 2. Vocabulary

Add these to `GLOSSARY.md` under a new `### Research` heading (in ticket 01).

| Term                | Meaning                                                                                                                                  | Avoid                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Topic**           | A private workspace for one space or audience ("tools for indie podcasters"). Holds runs, sources, evidence, ideas, reports and players. | Project, space (as a noun), folder              |
| **Seed**            | The words a Discover run starts from: a space, an audience, or a problem area.                                                           | Prompt, keyword                                 |
| **Plan**            | The list of search queries a run will make, drafted by the model and editable before the run spends anything.                            | Strategy, query set                             |
| **Depth**           | Quick or Deep: sets a run's budget, how many results it searches and how many pages it reads.                                            | Mode, level                                     |
| **Run**             | One execution of Discover, Validate, a question or Explore inside a Topic, with its own plan, budget, progress and cost.                 | Job, task, session                              |
| **Source**          | A stored copy of one web page (its text, title, site and fetch time), reused across runs while fresh.                                    | Document, page (on its own), link               |
| **Evidence**        | One exact quote from a source, with its kind, sentiment and flags. The only thing claims may cite.                                       | Snippet, excerpt, data point                    |
| **Idea**            | A product opportunity in a Topic: a named group of pain and request evidence, with a computed score.                                     | Opportunity, cluster, insight                   |
| **Idea score**      | The six sub-scores computed from an idea's evidence, and their weighted total.                                                           | Rating, rank, AI score                          |
| **Report**          | A cited write-up a run produces: a Validate report or an answer to a free-form question.                                                 | Summary, answer (on its own)                    |
| **Player**          | A product or company in a Topic's space, with positioning, pricing and the complaints evidence holds about it.                           | Competitor (it may be a partner), company, tool |
| **Research credit** | The unit research is metered in: one Firecrawl credit, with model tokens converted at a set rate. Every user starts at zero.             | Credits (on its own), tokens, quota             |

## 3. Data model

New migration `migrations/0023_research.sql` (later tables arrive with their tickets), mirrored in `src/lib/schema.ts`. All ids are `text` like the rest of the schema; every table carries `user_id` and cascades from `"user"`.

### 3.1 Credits

`research_credit_entries`: a ledger, same shape and rules as `allowance_entries` (migration 0020).

| Column       | Type         | Notes                                                                                                            |
| ------------ | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `id`         | text pk      |                                                                                                                  |
| `user_id`    | text fk user | cascade                                                                                                          |
| `kind`       | text         | `grant` (+), `reserve` (−, a run sets its budget aside), `release` (+, the unspent part returns when a run ends) |
| `credits`    | integer      | signed                                                                                                           |
| `note`       | text         | default `''`                                                                                                     |
| `run_id`     | text         | not a foreign key: history outlives deleted runs                                                                 |
| `created_at` | timestamptz  |                                                                                                                  |

Balance = `sum(credits)`. What a run spent = its reserve minus its release.

### 3.2 Topics and runs

`research_topics`

| Column                     | Type        | Notes                                                       |
| -------------------------- | ----------- | ----------------------------------------------------------- |
| `id`, `user_id`            |             |                                                             |
| `name`                     | text        | defaults to the first seed or question, trimmed to 80 chars |
| `created_at`, `updated_at` | timestamptz | `updated_at` moves on every finished run                    |

`research_runs`

| Column                                    | Type              | Notes                                                                                                                                                             |
| ----------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `user_id`, `topic_id`               |                   | `topic_id` cascades                                                                                                                                               |
| `kind`                                    | text              | `discover` (v1); later `validate`, `question`, `explore`                                                                                                          |
| `state`                                   | text              | `drafting` → `awaiting_plan` → `queued` → `running` → `done` \| `stopped` \| `failed`. `stopped` = budget reached or the user stopped it; results so far are kept |
| `stop_reason`                             | text null         | `budget`, `user`, `error`                                                                                                                                         |
| `depth`                                   | text              | `quick` \| `deep`                                                                                                                                                 |
| `input`                                   | jsonb             | Discover: `{ seed, audience?: "b2b"\|"b2c"\|"any", includeSites?: string[], excludeSites?: string[], sinceMonths?: number }`                                      |
| `plan`                                    | jsonb             | `[{ id, query, site?, intent }]`, as drafted then as edited                                                                                                       |
| `step`                                    | text              | current step name (§4.2)                                                                                                                                          |
| `progress`                                | jsonb             | per-step counters for the UI, e.g. `{ searched: 12, of: 18, read: 9, toRead: 20, quotes: 64, dropped: 7 }`                                                        |
| `budget_credits`                          | integer           | reserved at start                                                                                                                                                 |
| `firecrawl_credits`                       | integer           | spent so far                                                                                                                                                      |
| `tokens_in`, `tokens_out`                 | integer           | spent so far                                                                                                                                                      |
| `charged_credits`                         | integer null      | settled at the end                                                                                                                                                |
| `error`                                   | text null         | user-facing message                                                                                                                                               |
| `run_lease`, `lease_until`                | text, timestamptz | as in `narrations`: two invocations never work the same run                                                                                                       |
| `created_at`, `started_at`, `finished_at` | timestamptz       |                                                                                                                                                                   |

`research_queries`: every query a run actually sent, so later plans can flag repeats.

| Column                                | Type        | Notes                                                                                                     |
| ------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `id`, `user_id`, `topic_id`, `run_id` |             |                                                                                                           |
| `query_norm`                          | text        | lowercased, whitespace collapsed, `site:` kept                                                            |
| `results`                             | integer     | how many results came back                                                                                |
| `hits`                                | jsonb       | the results themselves (`{ url, title, description }[]`), so triage never searches again (migration 0024) |
| `created_at`                          | timestamptz | index `(topic_id, query_norm)`                                                                            |

### 3.3 Sources and evidence

`research_sources`: the page cache. Kept per user (no cross-user sharing of what someone researched).

| Column          | Type             | Notes                                                                                                                                                            |
| --------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `user_id` |                  |                                                                                                                                                                  |
| `url`           | text             | as fetched                                                                                                                                                       |
| `url_key`       | text             | normalised: lowercase host, no `www.`, no fragment, tracking params (`utm_*`, `ref`, `fbclid`…) dropped, Reddit `old.`/`np.` folded. Unique `(user_id, url_key)` |
| `site`          | text             | e.g. `reddit.com`, `news.ycombinator.com`                                                                                                                        |
| `kind`          | text             | `thread`, `review`, `pricing`, `homepage`, `article`, `other` (decides freshness, §4.6)                                                                          |
| `title`         | text             |                                                                                                                                                                  |
| `markdown`      | text             | main content, capped at `RESEARCH_MAX_PAGE_CHARS` _(start 60,000)_                                                                                               |
| `content_hash`  | text             | sha256 of `markdown`                                                                                                                                             |
| `published_at`  | timestamptz null | when known                                                                                                                                                       |
| `fetched_at`    | timestamptz      |                                                                                                                                                                  |
| `added_by`      | text             | `search` \| `link` (pasted)                                                                                                                                      |

`research_topic_sources`: which sources a topic has used. pk `(topic_id, source_id)`, plus `first_run_id`, `created_at`.

`research_evidence`

| Column                                             | Type             | Notes                                                                           |
| -------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------- |
| `id`, `user_id`, `topic_id`, `source_id`, `run_id` |                  |                                                                                 |
| `quote`                                            | text             | exact text from the source, 20 to 600 chars                                     |
| `kind`                                             | text             | `pain`, `request`, `workaround`, `price`, `competitor`, `stat`, `opinion`       |
| `sentiment`                                        | smallint         | −2 … +2                                                                         |
| `strong`                                           | boolean          | strong-feeling language ("so frustrating", "switched because", "dealbreaker")   |
| `pays`                                             | boolean          | willingness to pay: "I'd pay", a price, a budget, a paid alternative in use     |
| `names`                                            | text[]           | products named in the quote (feeds Players later)                               |
| `author_key`                                       | text null        | sha256 of site + author handle when the page shows one; never the handle itself |
| `posted_at`                                        | timestamptz null | the comment's own date when the page shows it, else the source's                |
| `match`                                            | text             | `exact` \| `close` (§4.8)                                                       |
| `created_at`                                       | timestamptz      | unique `(topic_id, source_id, md5(quote))` so re-reads never duplicate          |

### 3.4 Ideas

`research_ideas`

| Column                        | Type        | Notes                                                                        |
| ----------------------------- | ----------- | ---------------------------------------------------------------------------- |
| `id`, `user_id`, `topic_id`   |             |                                                                              |
| `title`                       | text        | ≤ 80 chars, a problem statement ("Editing remote interviews takes hours")    |
| `summary`                     | text        | ≤ 300 chars, who has it and when                                             |
| `status`                      | text        | `open`, `starred`, `dismissed`, `merged`                                     |
| `merged_into`                 | text null   | target idea when `merged`                                                    |
| `named_by`                    | text        | `model` \| `user` (a user rename is never overwritten)                       |
| `score`                       | jsonb       | `{ frequency, spread, intensity, pays, recency, competition, total }` (§4.9) |
| `score_total`                 | real        | `score.total` copied out for sorting                                         |
| `evidence_count`              | integer     |                                                                              |
| `first_run_id`, `last_run_id` | text        | for "new" and "+N since last run"                                            |
| `added_last_run`              | integer     | evidence added by `last_run_id`                                              |
| `created_at`, `updated_at`    | timestamptz | index `(topic_id, status, score_total desc)`                                 |

`research_idea_evidence`: pk `(idea_id, evidence_id)`, plus `run_id`. One piece of evidence belongs to at most one live idea.

### 3.5 Model answer cache

`research_model_cache`: pk `key` (sha256 of model id + prompt version + input), `output` jsonb, `tokens_in`, `tokens_out`, `created_at`. A hit costs nothing and isn't charged. Rows older than 30 days are deleted when runs finish.

### 3.6 Later tables (their own tickets)

- `research_reports` (Validate and questions): `id, topic_id, run_id, kind, idea_id?, question, body jsonb` where `body` is sections of claims, each `{ text, evidenceIds[] }`.
- `research_players` and `research_player_evidence` (Explore): `id, topic_id, name, name_key, url, category, one_liner, audience, pricing jsonb, free_plan, source_ids[], updated_at`.

## 4. Engine

### 4.1 Where the code goes

| Path                            | Role                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/research/*.ts`         | Pure logic, no I/O, tested directly: URL normalising, query normalising, budget arithmetic, quote checking, scoring, plan editing rules                                                                 |
| `src/lib/research-db.server.ts` | Queries for the tables above                                                                                                                                                                            |
| `src/server/services/research/` | `topics.ts`, `runs.ts` (orchestrator), `credits.ts`, `discover.ts` (steps), `fetch.ts` (Firecrawl + source cache), `models.ts` (model tiers, batching, cache), `match.ts` (the idea-matching interface) |
| `src/routes/api/research/`      | Thin HTTP wrappers (§6)                                                                                                                                                                                 |
| `scripts/research-grant.mjs`    | `pnpm research:grant <email> <credits> "<note>"`, a copy of `narration-grant.mjs`                                                                                                                       |

### 4.2 Run lifecycle

1. **Draft** (`POST /api/research/runs`): creates the topic if none was given, creates the run in `drafting`, drafts the plan with one writer-tier model call, flags repeats against `research_queries`, moves to `awaiting_plan`, returns the plan and the estimate. No Firecrawl call, no reservation. The plan's tokens are recorded on the run and charged only if it runs. With "skip review" on, the client calls start straight away.
2. **Start** (`POST /api/research/runs/$id/start` with the final plan and depth): validates the plan (§4.4), checks the `research` rate bucket, checks `balance ≥ budget`, writes a `reserve` entry, sets `queued`, then hands off to the background.
3. **Work**: the run takes a lease and walks its steps in order: `search` → `triage` → `fetch` → `extract` → `match` → `name` → `score` (verify, §4.8, runs inside each extract unit, so an unchecked quote is never stored; `name` is the one writer call that tidies new idea names, §4.9). Each step saves its output before the next one starts, so a new invocation resumes at the first unfinished step and never repeats a paid call. This is the narration pattern ([ADR 0001](../../adr/0001-narration-runs-in-self-chaining-waituntil.md)): `waitUntil`, check `getDeadline` before each unit of work, hand off to `POST /api/research/run` with `x-research-secret` (and the Vercel bypass header) when time is short.
4. **Budget**: before every Firecrawl or model call, `spent + worstCase(call) ≤ budget`, or the run skips to `score` with what it has and ends `stopped / budget`. A run never goes over its reservation.
5. **Settle**: on `done`, `stopped` or `failed`, `charged = firecrawl_credits + ceil((tokens_in + tokens_out) / RESEARCH_TOKENS_PER_CREDIT)` (the plan's tokens included), write a `release` of `budget − charged`, set `finished_at`, bump the topic's `updated_at`.
6. **Stop** (`POST …/stop`): sets a flag that the run checks between units of work; it then scores what it has and settles like a budget stop.
7. **Recovery**: as with narration, if a hand-off fails the lease expires, and the owner's next status poll (`GET …/runs/$id`) restarts the run from its step.

Where intermediate output lives: `research_queries` (search done), a `triage` list of URLs in the run's `progress` jsonb, `research_sources` and `research_topic_sources` (fetch), `research_evidence` (extract and verify), `research_idea_evidence` (match). Each step decides what's left by diffing against these tables, which makes the steps idempotent.

### 4.3 Model tiers and calls

- **Worker tier**: `AI_MODELS` via the existing chain (`aiLanguageModel()`, DeepSeek Flash by default). Used for triage, extraction and matching.
- **Writer tier**: `RESEARCH_WRITER_MODELS` (same format and fallback as `AI_MODELS`); falls back to the worker chain when unset, which is the default. Used for plans, idea naming and, later, reports.
- All calls use structured output (zod schemas) and go through `models.ts`, which: checks `research_model_cache` first, records tokens on the run, refuses calls that would overrun the budget, and batches. Prompts carry a version string that is part of the cache key.
- Model input is trimmed before it's sent: navigation, footers, cookie banners and link lists are stripped; long pages are cut into chunks around comment and review blocks, and only chunks that pass the code filter (§4.6) are sent.

### 4.4 Discover: plan

Writer-tier call. Input: seed, filters, the topic's existing idea titles (so the plan looks for new ground and for more support for open ideas), and the last 50 queries in the topic. Output: 10 to 25 queries, each `{ query, site?, intent }` where `intent` is `pain`, `wish`, `switching`, `alternatives` or `pricing`. A good plan mixes sites (Reddit, HN, G2/Capterra/Trustpilot/app-store reviews, Product Hunt, the open web) and phrasings that find complaints ("frustrating", "I wish", "alternative to", "switched from", "is there a tool").

Validation in code: at most `maxQueries[depth]` queries, each ≤ 200 chars, sites only from `includeSites` when given and never from `excludeSites`; repeats (same `query_norm` already sent in this topic) are flagged and left unchecked in the UI by default.

### 4.5 Discover: search and triage

- **Search**: one Firecrawl search per query, `limit = resultsPerQuery[depth]`, `sources: ["web"]`, plus `tbs` for `sinceMonths`. Requires a research variant of `buildSearchBody` with its own cap; the trip agent's `MAX_SEARCH_RESULTS = 8` stays as it is. Results are deduped by `url_key`; results already in this topic's sources are dropped.
- **Code filter first**: drop excluded sites, non-HTML files, login walls and obvious listicle spam (a short blocklist), then score each result on its title and snippet with cheap signals: pain words, a question form, a discussion site, recency.
- **Triage (one batched worker call)**: the surviving results' titles and snippets, 40 per call, are rated `read` / `skip`, with a reason. The top `pagesToRead[depth]` rated `read` go on, ordered by code score.

### 4.6 Discover: fetch

- Source cache first: a source with the same `url_key` is reused when it's fresher than its kind's limit: `thread` and `review` 30 days, `pricing` and `homepage` 7 days, `article` 90 days _(start)_. Reuse costs nothing.
- Otherwise `readPage` (Firecrawl scrape, `onlyMainContent`, its own `maxAge` cache) with a research cap of `RESEARCH_MAX_PAGE_CHARS`. Kind is inferred from the host and path.
- Failed pages are skipped and counted; one bad page never fails a run.

### 4.7 Discover: extract

Worker-tier, batched: up to ~24k characters of trimmed chunks per call, several sources per call, each chunk labelled with its `source_id`. The model returns quotes copied exactly from the text, each with `kind`, `sentiment`, `strong`, `pays`, `names`, the author handle and the date if visible. Rules in the prompt: quote only what's there, one point per quote, skip quotes about something other than the seed, 20 to 600 chars.

### 4.8 Discover: verify

Code only. Each quote is checked against its own source's `markdown`:

- **Exact**: after normalising both sides (Unicode NFKC, curly quotes to straight, whitespace collapsed, case folded, Markdown emphasis stripped), the quote is a substring. Stored with `match = exact`.
- **Close**: otherwise, the best window of the source with the same word count has ≥ 0.9 token overlap. Stored with `match = close` and the source's own wording replacing the model's. _(Threshold start value.)_
- Anything else is dropped and counted in `progress.dropped`. Dropped quotes are never stored or shown.

Author handles are hashed into `author_key` here and then thrown away.

### 4.9 Discover: match ideas, then score

**Matching** (`match.ts`, an interface so embeddings can replace it): only `pain`, `request` and `workaround` evidence is matched. One worker call per batch of up to 40 quotes, given the topic's live ideas (`open` and `starred`, title plus summary, up to 150; above that, the top 150 by score) and dismissed ideas (titles only). Each quote gets an existing idea id, a dismissed idea id, or `new` with a proposed title and summary. New proposals in a batch are merged with each other in code when their titles normalise the same, then one writer-tier call tidies the names of the new ideas from that run (one call per run, not per idea). Quotes matched to a dismissed idea attach to it quietly; it stays dismissed.

**Scoring** (`src/lib/research/score.ts`, pure). Over an idea's evidence; each sub-score is 0 to 1:

| Sub-score   | Computed from                                                                      | Start formula                                                                          |
| ----------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Frequency   | distinct authors (quotes with no author count 0.5 each)                            | `min(1, log2(1 + n) / log2(1 + 30))`                                                   |
| Spread      | distinct sites and distinct sources                                                | `min(1, (sites − 1) / 4) * 0.6 + min(1, sources / 10) * 0.4`                           |
| Intensity   | share of quotes with `strong` or sentiment ≤ −2                                    | ratio                                                                                  |
| Pays        | quotes with `pays`                                                                 | `min(1, n / 5)`                                                                        |
| Recency     | age of each quote's `posted_at`                                                    | mean of `0.5 ^ (ageDays / 180)`                                                        |
| Competition | products named in the idea's evidence, and how negative the quotes naming them are | shown as a label (`none`, `some`, `crowded`, `crowded but disliked`), not in the total |

`total = 0.25 frequency + 0.15 spread + 0.25 intensity + 0.25 pays + 0.10 recency`. The weights live in one constant. Competition stays out of the total because it can count for an idea or against it; the user reads it.

After scoring, ideas touched by the run get `last_run_id` and `added_last_run`; ideas created in the run also get `first_run_id`.

### 4.10 Budgets and estimates _(start values)_

|                           | Quick | Deep |
| ------------------------- | ----- | ---- |
| Max queries               | 12    | 25   |
| Results per query         | 8     | 15   |
| Pages to read             | 12    | 40   |
| Budget (research credits) | 30    | 100  |

The estimate on the plan screen = searches × Firecrawl credits per search + pages to read × (1 − expected cache hit rate) × credits per scrape + expected tokens ÷ `RESEARCH_TOKENS_PER_CREDIT`, shown as a range up to the budget. The cost table (credits per search by result count, per scrape) lives in one constant and is checked against Firecrawl's billing in ticket 09.

### 4.11 Paste a link

`POST /api/research/topics/$id/links` with a URL: fetches it as a Source (`added_by = link`) through the same cache, then runs extract → verify → match → score on that one source as a small Discover run (`input.seed` = the topic name, no plan, budget = 1 scrape + one batch of model calls). It shows in the run history like any other run.

## 5. Later modes (on the same engine)

### 5.1 Validate (ticket 15)

Started from an idea ("Validate this idea"). Plan drafting covers the idea's own words plus a required **counter-evidence** set of queries ("<category> good enough", "why I stopped using…", "<competitor> alternative not worth it", "shut down", "market too small"). The run reuses search → … → verify, then a writer-tier call drafts the report as sections of claims, each claim listing evidence ids. Code then checks every id exists in the topic; a claim with none is kept and marked **unsupported**. Sections: _The problem_, _How bad it is_, _Existing solutions_, _Willingness to pay_, _Counter-evidence_, _Verdict_ (open questions and the main risks to check next). The counter-evidence section is never empty: if nothing turns up, it says so and lists what was searched.

### 5.2 Free-form question (ticket 16)

"Ask a question": the same draft → start flow with `kind = question`; the report has no fixed sections, with the same claim and citation rules.

### 5.3 Explore (ticket 17)

Players come from two places: any evidence whose `names` holds a product, and an Explore run that searches for "best X tools", "X alternatives" and directory pages. For each new Player, the engine fetches the homepage and a pricing page (`kind = pricing`, 7-day freshness) and a worker call fills `one_liner`, `category`, `audience`, `pricing` and `free_plan` from those pages only. Complaint counts come from linked evidence. The Players tab is a sortable table grouped by category; Validate's _Existing solutions_ section reads from it.

## 6. API

All routes are `apiHandler` routes (Clerk session, same-site check), except the internal hand-off. Owner-scoped: a user only ever sees their own rows (404 otherwise).

| Method and path                              | Does                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /api/research/status`                   | `{ enabled, balance, writerModel: boolean }`. `enabled` is false unless Firecrawl and an AI model are configured |
| `GET /api/research/credits`                  | balance and the last 20 ledger entries                                                                           |
| `GET /api/research/topics`                   | the user's topics with idea counts and last run                                                                  |
| `POST /api/research/topics`                  | `{ name }`                                                                                                       |
| `GET /api/research/topics/$id`               | topic plus its runs (latest 20)                                                                                  |
| `PATCH /api/research/topics/$id`             | rename                                                                                                           |
| `DELETE /api/research/topics/$id`            | deletes the topic and everything in it; sources stay in the cache                                                |
| `GET /api/research/topics/$id/ideas?status=` | ideas with scores, sorted by total                                                                               |
| `GET /api/research/ideas/$id`                | the idea, its sub-scores and its evidence with source title, site and URL                                        |
| `PATCH /api/research/ideas/$id`              | `{ title?, summary?, status? }` (star, dismiss, reopen, rename)                                                  |
| `POST /api/research/ideas/merge`             | `{ intoId, fromIds[] }`: moves evidence, marks the others `merged`, rescores                                     |
| `GET /api/research/topics/$id/sources`       | sources the topic used, with evidence counts                                                                     |
| `POST /api/research/topics/$id/links`        | paste a link (§4.11)                                                                                             |
| `POST /api/research/runs`                    | draft: `{ topicId?, kind: "discover", input, depth }` → `{ run, plan, estimate, repeats }`                       |
| `POST /api/research/runs/$id/start`          | `{ plan, depth }` → 202                                                                                          |
| `POST /api/research/runs/$id/stop`           | 202                                                                                                              |
| `GET /api/research/runs/$id`                 | state, step, progress, spend so far; restarts a stalled run (§4.2, step 7)                                       |
| `POST /api/research/run`                     | internal hand-off, `x-research-secret`; not for browsers                                                         |

Rate limiting: a new `research` bucket in `RATE_LIMITS`, `{ limit: 20, windowSeconds: 3600 }` _(start)_, counted on draft and start, and added to `FAIL_CLOSED`. Credits are the real limit; the bucket stops scripted abuse.

## 7. UI

Built with Kami's existing primitives (`src/components/ui`, the Kami brand components); follow the Trips pages for layout and the Listening card for the credit display.

- **Nav**: a `research` entry in `site-header.tsx` after Trips, shown only when `status.enabled`. Phone bar: added at the end of the scroller.
- **`/research`**: three start cards (Find ideas, Ask a question, Map a space; the last two read "coming soon" until their tickets ship), the topics list (name, live idea count, last run, updated), and the credit balance with a link to the ledger.
- **Find ideas flow**: seed field, optional filters behind "More options" (audience, include/exclude sites, time window), topic picker (default "New topic"), depth toggle, "Skip review" toggle → **plan screen**: a list of queries with checkboxes, inline edit, add and remove; repeats unchecked and labelled "already searched"; the estimate ("about 18–30 credits, budget 30") and the balance; Run (disabled with "No research credits" when the balance is below the budget).
- **Run view** (`/research/runs/$runId`): the steps as a list with live counters from `progress`, polled every 2 s while running; partial ideas appear as soon as `match` has output; a Stop button; at the end, the spend split (Firecrawl credits, tokens in and out, credits charged).
- **Topic page** (`/research/$topicId`): tabs **Ideas**, **Sources**, **Runs** (Reports and Players come with their tickets) and a "Paste a link" field.
  - **Ideas**: cards sorted by total, each showing title, summary, the five sub-scores as small labelled bars, the competition label, evidence count, and "New" or "+N" badges from the last run. Filter by status; star, dismiss, merge (select several → Merge), rename.
  - **Idea detail** (a sheet on the topic page): each sub-score with the quotes behind it, every quote linking to its source URL and showing site, date and `close` marks.
  - **Sources**: title, site, kind, fetched date, evidence count.
  - **Runs**: kind, depth, state, ideas added, credits charged.
- Empty and edge states: no credits (Run disabled, how to get credits is the operator's job, so no self-serve copy); a run that ended `stopped / budget` says so above its results; a run that found nothing says what it searched.

## 8. Config

Add to `.env.example` in a new "Research (optional)" section:

| Var                          | Default           | Notes                                                                                               |
| ---------------------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| `FIRECRAWL_API_KEY`          | (existing)        | required for Research                                                                               |
| `AI_MODELS` / provider keys  | (existing)        | worker tier; required                                                                               |
| `RESEARCH_WRITER_MODELS`     | unset             | writer tier; falls back to `AI_MODELS`                                                              |
| `RESEARCH_TOKENS_PER_CREDIT` | `20000` _(start)_ | model tokens per research credit                                                                    |
| `RESEARCH_MAX_PAGE_CHARS`    | `60000`           | per stored source                                                                                   |
| `RESEARCH_RUN_SECRET`        | unset             | 16+ chars; required on Vercel for background hand-off (also uses `VERCEL_AUTOMATION_BYPASS_SECRET`) |

`researchConfigured()` = Firecrawl key, an AI model, and (when `VERCEL` is set) the run secret.

## 9. Tests

Node tests under `tests/research/*.test.mjs`, in the repo's existing style.

- Pure units: `url_key` normalising (Reddit host folding, tracking params), `query_norm`, plan validation and repeat flagging, quote checking (exact, close, dropped; curly quotes, Markdown emphasis, whitespace), scoring (each sub-score, weights, competition label), budget arithmetic and the settle formula, source freshness by kind.
- Engine with fakes: a fake Firecrawl and a fake model behind the same interfaces; a Discover run end to end; a run interrupted after each step resumes without repeating a paid call; a run at its budget stops cleanly and releases the rest; a second run attaches evidence to existing ideas and leaves dismissed ideas dismissed; the model cache returns hits without charging.
- Credits: reserve and release balance out; a run can't start over the balance; concurrent starts can't overdraw (one transaction with a row lock on the user).
- Routes: owner scoping returns 404 for another user's topic, run or idea; the internal route rejects a missing or wrong secret.

## 10. Docs to update when v1 lands

`GLOSSARY.md` (§2, in ticket 01), `docs/ARCHITECTURE.md` (a Research section), `docs/DATA-MODEL.md`, `docs/API.md`, `.env.example`, `README.md` (scripts table: `research:grant`), and an ADR for "quote-level evidence checked in code, scores computed in code" (ticket 14).
