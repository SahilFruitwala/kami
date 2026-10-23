# Narration runs in the background via self-chaining `waitUntil`, not a queue

Turning a long article into audio takes many Deepgram calls (2,000 characters each), which can outlast one request and shouldn't depend on the reader keeping the tab open. We run it after responding with `waitUntil`, and when a run nears the 300s Hobby function budget it re-invokes its own endpoint (authenticated with a server secret) to continue. Each finished part is stored in R2 before the next starts, so a crash or timeout only means a later run resumes; nothing is paid for twice.

## Considered Options

- **Browser-driven batches**: simplest, but generation stops when the reader leaves.
- **Upstash QStash**: proper retries and signed delivery, but adds a vendor and a daily message quota for something a single-user app does a few times a day.
- **Vercel Cron**: once a day on Hobby; unusable for on-demand work.

## How

- `waitUntil` and `getDeadline` from `@vercel/functions` (they read the Vercel runtime's request context, so they work under TanStack Start + Nitro; locally they are no-ops and the promise floats in the dev server).
- Before each part the run checks the time left against one part's worst case; when short, it releases its lease and calls `POST /api/narrations/run` at `https://$VERCEL_URL` (the same deployment, so the same code mid-deploy), sending `x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET` (Deployment Protection covers every deployment URL) and our own secret. The caller awaits the callee's 202 inside its `waitUntil` chain; a fire-and-forget fetch may never leave a function that is about to end.
- The internal route does not use `apiHandler` (no Clerk session, no same-site check).

## Consequences

Two runs for the same article must never overlap: a run claims the job with a lease in the database, and a re-trigger that finds a live lease exits. If a hand-off fails, the lease expires and the owner's next status check restarts the run.
