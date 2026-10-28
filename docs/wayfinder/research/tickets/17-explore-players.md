---
type: build
status: closed
assignee:
phase: 4-explore
blocked-by: [15-validate-report.md]
---

# Explore: Players

## Scope

- `research_players` and `research_player_evidence`; Players created from evidence `names` and from `kind = explore` runs; homepage and pricing fetch and a worker call to fill the fields from those pages only ([spec §5.3](../spec.md#53-explore-ticket-17)).
- Players tab (sortable table grouped by category); enable the "Map a space" start card; Validate's Existing solutions section reads from Players.

## Done when

- Names in evidence turn into Players without duplicates (normalised `name_key`); every Player field traces to a fetched page.

## Resolution

Built on `research/phase-3`.

- `research_players` and `research_player_evidence` (migration 0026), unique per topic on `name_key` (`nameKey` folds "Notion", "Notion.so" and "Notion Inc." together). The code-only `players` step (final, free) turns every name in a run's quotes into a Player and links the quotes; Discover runs now include it too.
- `kind = explore` runs: a writer-tier plan for roundups, alternatives and directory pages; triage and extract take an `explore` mode with their own prompts (they keep roundups and pull sentences that name products); then `fill`, one Player per unit, best-known first, up to 8 (quick) or 20 (deep) a run. Fill searches for the product's site, takes the first result whose host contains the product's name (`pickHomepage`; none means the Player is left unfilled, never guessed), reads its homepage and `/pricing` (7-day cache), and one worker call fills `one_liner`, `category`, `audience`, `free_plan` and plans from those pages only. Every plan price must appear on the pricing page (`checkPricing`) and "free plan" must be on a page, or they are dropped. A Player looked up with nothing found is never looked up again.
- Players tab: table grouped by category, sortable by quotes, complaints, free plan or name; "Map this space" starts an Explore run in the topic, and the "Map a space" card on `/research` is on. Quotes and complaint counts come from linked evidence.
- Validate's report prompt now lists the topic's best-known Players, so its _Existing solutions_ claims are organised around them (claims still cite quotes).
- Checked on real runs (topic "invoicing and getting paid for freelance designers"): Validate cost 32 credits (28 cited quotes, all real, 4 real counter claims); a question cost 29; Map a space cost 45 and stopped at budget with 118 quotes and about 100 products noted but only 2 filled, since 24 searches and 12 page reads used most of it. Explore now reads half as many pages (6 at quick) to leave room for filling. The player call sometimes named plans without prices, so price is now required (`explore-player-v2`); CloudBooks then came back with three checked prices and a free trial. Known rough edges: spellings of one product that `nameKey` can't fold ("QuickBooks" / "QuickBooks Online", "Fiverr" / "Fiverr Workspace") become separate Players, and a site without `/pricing` gets no plans.
- Found and fixed while testing: question reports were forced into Validate's six sections (a leftover `fixed` argument).
