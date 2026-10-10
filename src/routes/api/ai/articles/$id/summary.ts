import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { getArticleSummary, summarizeArticle } from "@/server/services/ai-articles";
import { articleIdParams } from "@/server/services/library";

export const Route = createFileRoute("/api/ai/articles/$id/summary")({
  server: {
    handlers: {
      GET: apiHandler({ params: articleIdParams }, ({ userId, params }) =>
        getArticleSummary(userId, params.id),
      ),
      POST: apiHandler({ params: articleIdParams, rateLimit: "ai" }, ({ userId, params }) =>
        summarizeArticle(userId, params.id),
      ),
    },
  },
});
