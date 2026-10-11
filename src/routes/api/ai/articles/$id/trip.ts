import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { tripFromArticle } from "@/server/services/ai-trips";
import { articleIdParams } from "@/server/services/library";

export const Route = createFileRoute("/api/ai/articles/$id/trip")({
  server: {
    handlers: {
      POST: apiHandler({ params: articleIdParams, rateLimit: "ai" }, ({ userId, params }) =>
        tripFromArticle(userId, params.id),
      ),
    },
  },
});
