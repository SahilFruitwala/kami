import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { tidyArticle } from "@/server/services/ai-articles";
import { articleIdParams } from "@/server/services/library";

export const Route = createFileRoute("/api/ai/articles/$id/tidy")({
  server: {
    handlers: {
      POST: apiHandler({ params: articleIdParams, rateLimit: "ai" }, ({ userId, params }) =>
        tidyArticle(userId, params.id),
      ),
    },
  },
});
