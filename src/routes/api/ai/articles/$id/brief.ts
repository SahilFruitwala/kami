import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { audioBrief } from "@/server/services/ai-articles";
import { articleIdParams } from "@/server/services/library";

export const Route = createFileRoute("/api/ai/articles/$id/brief")({
  server: {
    handlers: {
      // POST: may call the model (cached until the article's text changes).
      POST: apiHandler({ params: articleIdParams, rateLimit: "ai" }, ({ userId, params }) =>
        audioBrief(userId, params.id),
      ),
    },
  },
});
