import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { entryIdParams, summarizeEntry } from "@/server/services/ai-feeds";

export const Route = createFileRoute("/api/ai/feeds/entries/$id/summary")({
  server: {
    handlers: {
      // POST: may call the model (cached after the first time).
      POST: apiHandler({ params: entryIdParams, rateLimit: "ai" }, ({ userId, params }) =>
        summarizeEntry(userId, params.id),
      ),
    },
  },
});
