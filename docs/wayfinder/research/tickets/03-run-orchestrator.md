---
type: build
status: open
assignee:
phase: 1-engine
blocked-by: [01-schema-and-glossary.md, 02-research-credits.md]
---

# Run orchestrator: states, lease, steps, hand-off, budget, stop

## Scope

- `src/server/services/research/runs.ts`: the lifecycle in [spec §4.2](../spec.md#42-run-lifecycle): draft → awaiting_plan → queued → running → done | stopped | failed; a step runner that resumes at the first unfinished step; lease (`run_lease`, `lease_until`) like `narrations`.
- Self-chaining background work per [ADR 0001](../../../adr/0001-narration-runs-in-self-chaining-waituntil.md): `waitUntil`, `getDeadline`, hand-off to `POST /api/research/run` with `x-research-secret`.
- Budget guard every paid call must go through: `spent + worstCase ≤ budget`, else jump to `score` and end `stopped / budget`.
- Stop flag, failure handling (user-facing `error`), settle on every terminal state, restart of a stalled run from the status poll.
- Steps are registered by name so Discover (and later Validate, Explore) plug in their own lists.

## Done when

- With a fake step list: interrupting after each step and resuming repeats no paid call; a budget stop keeps partial output and releases the rest; two invocations never run the same run at once.

## Resolution
