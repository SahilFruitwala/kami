---
label: wayfinder:map
---

# Map: Research

## Destination

A research section in Kami (`/research`) that finds product ideas in what real people say online, checks them, and maps the players in a space, with every claim tied to a stored, checked quote. v1 ships Discover end to end; Validate, free-form questions and Explore follow on the same engine. The build spec is [spec.md](spec.md).

## Notes

- Domain: new. Lives in Kami's codebase and reuses its plumbing only: Clerk auth, Postgres/Drizzle, the `AI_MODELS` chain (`src/lib/llm.server.ts`), the Firecrawl client (`src/lib/firecrawl.server.ts`), the rate limiter (`src/lib/rate-limit.server.ts`), and the narration patterns for an allowance ledger (`allowance_entries`, `scripts/narration-grant.mjs`) and background runs ([ADR 0001](../../adr/0001-narration-runs-in-self-chaining-waituntil.md)).
- It never reads or writes the library, highlights, feeds, shelves or trips.
- `src/server/services/trip-agent.ts` already runs a model loop with Firecrawl search and page reads; borrow from it, don't couple to it.
- Settled by `/grilling` on 2026-10-26, one question at a time, recommendation first. User's standing instruction: be efficient with AI usage and spending.

## Decisions so far

1. **Placement**: inside Kami's codebase as a fresh product; Kami's existing content is not a data source.
2. **Main job**: all three modes: Discover (find ideas), Research (answer questions and validate ideas), Explore (map a space).
3. **Shape**: a Topic workspace is the container; three separate starts on `/research` (Find ideas, Ask a question, Map a space). Every run lands in a Topic, auto-created from the prompt when none is picked.
4. **Sources**: Firecrawl search and scrape with `site:` targeting (Reddit, Hacker News, review sites, Product Hunt) plus the free HN Algolia API; a "paste a link" box in every Topic. No native Reddit, X or Product Hunt APIs in v1.
5. **Access**: every user, metered; everyone starts at 0 research credits and the operator grants them by script.
6. **Execution**: background runs with saved steps, on the narration self-chaining `waitUntil` pattern; live progress, partial results, resume without paying twice.
7. **Evidence**: quote-level and strictly cited. Claims cite evidence ids; code checks every quote against its stored source; uncited claims show as "unsupported".
8. **Idea ranking**: transparent sub-scores computed in code from evidence (frequency, spread, intensity, willingness to pay, recency, competition); the model only classifies quotes.
9. **Build order**: Discover, then Research (as "Validate this idea"), then Explore.
10. **Discover input**: seed plus optional filters, then a model-drafted plan of queries the user can edit, a depth (Quick / Deep), a credit estimate, then run. A "skip review" toggle.
11. **Ideas across runs**: ideas belong to the Topic and build up across runs. New quotes are matched to existing ideas by the model behind a small interface (embeddings can replace it later). Star, dismiss, merge by hand; dismissed ideas stay dismissed.
12. **Validate**: a fixed report template (problem, how bad it is, existing solutions, willingness to pay, a required counter-evidence pass, verdict) plus free-form cited questions.
13. **Explore**: a table of Players, created automatically from competitor mentions and filled in from each homepage and pricing page.
14. **Spending rules**: cheap model by default (optional `RESEARCH_WRITER_MODELS`, unset); snippets first, scrape only promising results; never scrape a URL twice while fresh; batch model calls and let code do counting, scoring and checking; cache model answers by input hash; hard per-run budget with a clean stop.
15. **Credit unit**: one research credit = one Firecrawl credit; model tokens convert at `RESEARCH_TOKENS_PER_CREDIT`. Granted with `pnpm research:grant`. Runs show the raw split.
16. **Placement in the app**: top-level `/research` in the nav, hidden unless Firecrawl and an AI model are configured; with 0 credits the page shows but Run is disabled.
17. **v1 scope**: thin end-to-end Discover, built as engine plus debug page first, then the product UI.

## Tickets

- **Phase 1, engine** (tuned on a debug page before any product UI): [01 schema and glossary](tickets/01-schema-and-glossary.md), [02 credits](tickets/02-research-credits.md), [03 run orchestrator](tickets/03-run-orchestrator.md), [04 fetch and source cache](tickets/04-fetch-and-source-cache.md), [05 model tiers and cache](tickets/05-model-tiers-and-cache.md), [06 plan, search, triage](tickets/06-discover-plan-search-triage.md), [07 extract and verify](tickets/07-extract-and-verify.md), [08 matching and scoring](tickets/08-idea-matching-and-scoring.md), [09 debug page and tuning](tickets/09-debug-page-and-tuning.md).
- **Phase 2, Discover product (v1)**: [10 home, topics, nav](tickets/10-research-home-and-topics.md), [11 plan screen and run view](tickets/11-discover-plan-and-run-ui.md), [12 ideas tab](tickets/12-ideas-tab.md), [13 paste a link](tickets/13-paste-a-link.md), [14 docs and ADR](tickets/14-docs-and-adr.md).
- **Phase 3, Validate**: [15 validate report](tickets/15-validate-report.md), [16 free-form question](tickets/16-free-form-question.md).
- **Phase 4, Explore**: [17 players](tickets/17-explore-players.md), [18 HN Algolia](tickets/18-hn-algolia.md).
- Frontier now: 02 and 04 (01 closed).

## Not yet specified

- Exact Quick and Deep budgets and the Firecrawl cost table: measured on real seeds in [ticket 09](tickets/09-debug-page-and-tuning.md); spec.md gives starting values.
- Quote matching thresholds (exact vs fuzzy) beyond the starting rule in spec.md: tuned in ticket 09.
- Whether a plan that is drafted but never run is charged (spec.md says no; revisit if plan drafting gets abused).
- How the Validate report is laid out on the page, and how Players render on phone: settled when those tickets open.

## Later (not v1, no tickets yet)

- Splitting an idea, the stronger writer model as a default, scheduled re-runs on the `CRON_SECRET` hook, embedding-based matching (pgvector), a native Reddit integration, export (Markdown/CSV), a positioning chart over Players.

## Out of scope

- Using Kami's library, highlights, feeds, shelves or trips as research material.
- Native integrations with paid or restricted APIs (Reddit, X) in v1.
- Sharing Topics with other users.
- Any model-made score that isn't computed from stored evidence.
