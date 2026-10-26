---
type: build
status: open
assignee:
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
