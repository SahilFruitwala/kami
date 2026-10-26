import { createFileRoute } from "@tanstack/react-router";
import { continueRun, runBody, runSecretMatches } from "@/server/services/research/runs";

/**
 * Internal: a research run handing itself off to a fresh invocation
 * (docs/adr/0001). Not for browsers, so not `apiHandler` (no Clerk session,
 * no same-site check): it authenticates with the server's run secret and
 * answers 202 at once, continuing the run in the background.
 */
export const Route = createFileRoute("/api/research/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!runSecretMatches(request.headers.get("x-research-secret"))) {
          return new Response(null, { status: 404 });
        }
        const parsed = runBody.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response(null, { status: 400 });
        continueRun(parsed.data.runId, new URL(request.url).origin);
        return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
      },
    },
  },
});
