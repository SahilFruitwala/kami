import { createFileRoute } from "@tanstack/react-router";
import { hookHandler } from "@/server/hooks";
import { refreshAllDueFeeds } from "@/server/services/feeds";

/**
 * Sweep of every due feed. Not scheduled for now — feeds are fetched on
 * demand from /feeds. Kept so a scheduler can be added later; it needs
 * `Authorization: Bearer $CRON_SECRET` and returns 503 while that is unset.
 */
const sweep = hookHandler("CRON_SECRET", () => refreshAllDueFeeds());

export const Route = createFileRoute("/api/hooks/feeds")({
  server: {
    handlers: { GET: sweep, POST: sweep },
  },
});
