import { createFileRoute } from "@tanstack/react-router";
import { hookHandler } from "@/server/hooks";
import { refreshAllDueFeeds } from "@/server/services/feeds";

/**
 * Scheduled sweep of due feeds (Vercel Cron sends `Authorization: Bearer
 * $CRON_SECRET`). Any external scheduler can call it the same way.
 */
const sweep = hookHandler("CRON_SECRET", () => refreshAllDueFeeds());

export const Route = createFileRoute("/api/hooks/feeds")({
  server: {
    handlers: { GET: sweep, POST: sweep },
  },
});
