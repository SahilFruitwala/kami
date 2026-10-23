import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { restoreOriginal } from "@/server/services/ai-articles";
import { articleIdParams } from "@/server/services/library";

export const Route = createFileRoute("/api/ai/articles/$id/restore-original")({
  server: {
    handlers: {
      POST: apiHandler({ params: articleIdParams }, ({ userId, params }) =>
        restoreOriginal(userId, params.id),
      ),
    },
  },
});
