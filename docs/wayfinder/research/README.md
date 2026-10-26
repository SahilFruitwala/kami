# Local wayfinding tracker

Local-markdown tracker for the Research effort.

- `map.md` is the map (label `wayfinder:map`): destination, notes, decisions so far, fog, out of scope.
- `spec.md` is the build spec: vocabulary, data model, engine pipeline, API, UI, config and tests. Tickets point into it rather than repeating it.
- `tickets/NN-name.md` are child issues. Front matter holds `type` (build), `status` (open | closed), `assignee` (the claim), `phase` and `blocked-by` (filenames).
- Frontier = open, unclaimed tickets whose `blocked-by` are all closed.
- Resolving: fill `## Resolution` with what was built and anything that changed from the spec, set `status: closed`, and update `spec.md` if the build moved a decision.
