---
type: grilling
status: closed
assignee: sahil
blocked-by: [07-restore-agent-inventory.md]
---

# What may the trip agent change, and how do undo and limits work?

## Question

Can the agent edit status, delete items, change dates? Does undo stay one turn deep? Per-user cost and rate limits, and which model. Probe edge cases: agent edits an archived or booked trip; undo after a manual edit.

## Resolution

- Web research: restored as before (user chose "with it"): `web_search` and `read_page` via Firecrawl, optional on `FIRECRAWL_API_KEY`, 6 calls per reply, own rate bucket, limited to user-pasted URLs for page reads.
- Model: no per-chat picker; the planner uses the shared `AI_MODELS` chain via `aiLanguageModel()`, gated on `aiConfigured()`.
- Status: the agent never changes `status` (user's call: "agent is only for planning"). No status tool; undo never has to cover it. It may suggest a status change in its reply.
- Edits and undo, carried over unchanged from the old agent: it can edit trip details, hotels and whole days through the same service functions as the board; one snapshot per trip, taken before the first write of a reply; undo restores only the latest reply. Status does not restrict the agent: it can plan on a `done` or `archived` trip, since status is only a label.
- Limits, carried over: 8 steps per reply, 16 history messages sent to the model, 200 stored per trip, `agent` rate bucket 40 per hour (fail-closed), research capped at 6 calls per reply.
- Known caveat for the build: undo restores the whole trip, so manual edits made after the agent's reply are lost. The build must either warn before undoing or refuse when the trip changed since the snapshot; choose while building.
