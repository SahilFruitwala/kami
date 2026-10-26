---
type: build
status: closed
assignee: sahil
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

- `src/lib/research/run-engine.ts` (pure, like `narration-engine.ts`): `nextAction` (exit / hand-off / work a step / finish), `currentStep` and `stepAfter` (once stopping, only `final` steps run), `isStalledRun`, `fitsBudget`, `DEPTH_BUDGETS` (quick 30, deep 100), `LEASE_MS` 180 s, default unit budget 120 s. A run past its last step stores `step = "end"`.
- `src/lib/research-runs-db.server.ts`: `claimRun` (free, expired or own lease; queued becomes running; `started_at` set once), `updateLeasedRun`, `addRunSpend` (SQL increments, lease-checked), `mergeRunProgress` (jsonb merge, deliberately not lease-checked so Stop can write it), `getRunById`.
- `src/server/services/research/runs.ts`:
  - `registerRunSteps(kind, steps)`: a step is `{ name, final?, unitBudgetMs?, work(ctx) → done }`. `ctx` gives `ensureBudget(worstCase)`, `recordSpend`, `saveProgress` and the current run.
  - `draftRun(userId, request, drafter)`: creates the topic when none is given, records the plan's tokens, moves to `awaiting_plan`. A drafter failure ends the run `failed` with `charged_credits = 0`. Ticket 06 supplies the drafter.
  - `startRun`: queues the run and reserves its depth budget in one transaction (402 with the shortfall, 409 if not `awaiting_plan`), then kicks the background loop.
  - `requestStop`: a draft just ends `stopped / user` with `charged_credits = 0`; an active run gets `progress.stopRequested`, and a stalled one is restarted so it can finish.
  - `getRunStatus`: the poll; restarts a stalled run.
  - `runResearch`: the loop. `BudgetExceededError` sets `stop_reason = budget` and carries on with the final steps; `RunStepError` messages are shown to the user, anything else gets a generic message; every terminal state settles credits and bumps the topic.
- `POST /api/research/run` (internal hand-off, `x-research-secret`), and the route tree regenerated; documented in `docs/API.md` (the API docs test requires it).
- Tests: `tests/research-run-engine.test.mjs` (pure engine) and `tests/db/research-runs.test.mjs` with fake steps: handed off after every unit, it finishes with no repeated paid call and the right charge and release; a budget stop runs the final step and releases the rest; Stop skips to the final step; a failing step ends `failed` with its message and settles; a run held by another lease is left alone; draft → 402 without credits → Stop → 409 on start; owner scoping. Full suite with the DB: 337 pass.
- For later tickets: the rate bucket is counted in `draftRun` and `startRun`. Pruning the model cache when a run ends is left to ticket 05.
