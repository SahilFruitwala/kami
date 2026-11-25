# Local wayfinding tracker

Local-markdown tracker for the Trips return effort.

- `map.md` is the map (label `wayfinder:map`): destination, notes, decisions so far, fog, out of scope.
- `tickets/NN-name.md` are child issues. Front matter holds `type`, `status` (open | closed), `assignee` (the claim) and `blocked-by` (filenames).
- Frontier = open, unclaimed tickets whose `blocked-by` are all closed.
- Resolving: fill `## Resolution`, set `status: closed`, add a line to Decisions so far in `map.md`.
