---
type: build
status: closed
assignee: sahil
phase: 1-engine
blocked-by: [01-schema-and-glossary.md]
---

# Research credits: ledger, grant script, reserve and settle

## Scope

- `src/server/services/research/credits.ts`: balance, `reserve(runId, budget)` (one transaction, row lock on the user, refuses if balance < budget), `settle(runId)` writing the `release` per [spec §4.2](../spec.md#42-run-lifecycle) step 5.
- `scripts/research-grant.mjs` and `pnpm research:grant <email> <credits> "<note>"`, copied from `narration-grant.mjs`.
- `research` rate bucket in `RATE_LIMITS`, added to `FAIL_CLOSED`.
- `researchConfigured()` and the new env vars in `.env.example` ([spec §8](../spec.md#8-config)).

## Done when

- Tests: reserve and release balance out; starting over the balance is refused; two concurrent reserves can't overdraw; settle charges `firecrawl + ceil(tokens / RESEARCH_TOKENS_PER_CREDIT)`.
- Granting yourself credits by script works and prints the new balance.

## Resolution

- `src/lib/research/credits.ts` (pure): `availableCredits`, `canReserveCredits`, `chargedCredits` (Firecrawl credits + tokens rounded up, capped at the budget), `unspentCredits`.
- `src/lib/research-credits-db.server.ts`: the ledger with the narration allowance's per-user advisory lock (key `research-credits:<userId>`). `reserveRunCredits` also writes `budget_credits` on the run; `settleRunCredits` sets `charged_credits` (capped at the budget in SQL) and writes the release in one transaction, and is a no-op once the run is settled, so it is safe on every terminal state.
- `src/server/services/research/credits.ts`: `currentResearchConfig`, `researchConfigured`, `getResearchCredits` (the credits panel view) and `settleRun` (charge from the run's recorded spend).
- `src/lib/research-config.server.ts`: on with `FIRECRAWL_API_KEY` and an AI model; the run secret is required only when `VERCEL` is set. Takes `aiReady` as a parameter so it stays testable without the model SDKs.
- `research` rate bucket (20 per hour, fail-closed). Counting it on draft and start belongs to tickets 03 and 11.
- `scripts/research-grant.mjs` and `pnpm research:grant`; `.env.example` Research section.
- Verified: `tests/research-credits.test.mjs` (arithmetic, config) and `tests/db/research-credits.test.mjs` (starts at zero, two concurrent reserves can't overdraw, settle charges once and returns the rest, over-budget charge capped, newest-first listing). Full suite with the DB: 322 pass. Grant script run by hand against a throwaway local user: add, take back, unknown email, non-integer.
