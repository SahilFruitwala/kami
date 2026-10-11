import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { autoTagArticle } from "@/server/services/ai-articles";
import { articleIdParams } from "@/server/services/library";

export const Route = createFileRoute("/api/ai/articles/$id/autotag")({
  server: {
    handlers: {
      POST: apiHandler({ params: articleIdParams, rateLimit: "ai" }, ({ userId, params }) =>
        autoTagArticle(userId, params.id),
      ),
    },
  },
});
