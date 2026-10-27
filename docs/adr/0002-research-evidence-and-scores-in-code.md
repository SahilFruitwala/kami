# Research keeps quote-level evidence checked in code, and scores ideas in code

Research turns what people say online into ranked product ideas. Models are good at reading a page and saying which sentences are complaints, and at grouping complaints that mean the same thing. They are not reliable at quoting: asked for quotes, they paraphrase, join sentences or invent plausible ones. And a score a model gives ("8/10, strong demand") can't be explained or reproduced. So the model only ever labels and groups; everything a user is asked to trust is either a stored copy of someone's words or arithmetic over those copies.

## Decision

- **Evidence is a quote, checked against its page.** The extract step asks the model for exact quotes from the page Markdown we stored. Code then looks for each quote in that stored text: an exact match (after normalising quotes, emphasis and whitespace) is kept as `exact`; a near match is kept as `close`, in the page's own words; anything else is dropped and counted. Every quote links to its source URL, and the same quote is never stored twice in a topic.
- **Ideas are scored in code from their evidence.** The model labels single quotes (kind, sentiment, strongly felt, mentions paying, products named). `src/lib/research/score.ts` turns those labels into five sub-scores (people, spread, intensity, willingness to pay, recency) and a weighted total, plus a competition label kept out of the total. Weights were tuned on real runs (ticket 09) so an idea several people raise ranks above one strongly felt quote.

## Considered Options

- **Let the model write the findings, with citations.** Fewer steps, but citations can't be trusted without the check above, and a paragraph can't be ranked, filtered or merged.
- **A model-given score per idea.** Cheap and fluent, but it changes from run to run, can't be explained ("why 7?") and can't be recomputed when ideas are merged.
- **Embeddings for matching and scoring.** Matching may move to embeddings later (it sits behind the `Matcher` interface); scoring stays arithmetic either way.

## Consequences

- Every number on an idea card can be traced to quotes, and recomputed: merging ideas just rescores the survivor from its evidence.
- A quote the model mangled is lost rather than shown wrongly; the run reports how many were dropped. On the first real runs 99.4% matched exactly.
- Score weights are code, so changing them is a reviewed change, and stored ideas can be rescored for free.
