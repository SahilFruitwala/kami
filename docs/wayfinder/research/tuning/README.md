# Tuning scripts (ticket 09)

Operator tools for running Discover on real seeds from a terminal, through the app's own code (`draftRun`, `startRun`, the run loop). Used when the debug page (`/research/debug`) can't be reached signed in, e.g. from the agent's browser pane. They read `.env` like the app and act as the first account in `RESEARCH_DEBUG_EMAILS` (or the earlier run's owner).

**Every run spends real research credits** (Firecrawl, plus model tokens). Drafting a plan is one writer-model call.

Run from the repo root, with the test loader (it resolves `@/…` imports):

```bash
node --experimental-transform-types --no-warnings=ExperimentalWarning --import ./tests/support/register.mjs docs/wayfinder/research/tuning/draft.mjs "tools for indie podcasters" quick
```

- `draft.mjs "<seed>" [quick|deep] [topicId] [stopRunId]`: draft a plan (one writer call) and print it; optionally into an existing topic, and stop an older draft first.
- `rerun.mjs <runId>`: a new run in the same topic with an earlier run's plan, all queries checked, with no model call. The topic's stored searches are reused for free.
- `start.mjs <runId>`: start a drafted run and drive it to the end in this process, logging each change, then print searches, picks, evidence and ideas. Locally there is no `RESEARCH_RUN_SECRET`, so the dev server refuses the HTTP hand-off; the script picks a freed run up again itself.

## Runs so far (topic "tools for indie podcasters", `0e32c334-fdcc-41d2-83e7-ebe3d9261a35`)

| Run        | What happened                                                                                                                                              | Charged                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `db167118` | Draft 1: the model set no `site` on any query. Prompt changed to require one (`discover-plan-v2`); draft stopped.                                          | plan tokens only, not charged |
| `1ddac25f` | 10 of 12 searches, then Firecrawl 429 failed the run (no retry existed). Searches good: Reddit excellent, Trustpilot good, Capterra mixed, G2 and HN weak. | 21                            |
| `f8db7afe` | Searches reused for free, triage picked 12 Reddit threads, then Firecrawl 403 on reddit.com ("we do not support this site") failed the run.                | 5                             |
| `d8296105` | Reddit's public `.json` answered 403 for all 12 picks (unauthenticated reads refused); skipped cleanly, nothing read.                                      | 0                             |
