import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { getOriginalCopy } from "@/server/services/ai-articles";
import { articleIdParams } from "@/server/services/library";

export const Route = createFileRoute("/api/ai/articles/$id/original")({
  server: {
    handlers: {
      // The copy as saved before the clean-up, for "Review clean-up".
      GET: apiHandler({ params: articleIdParams }, ({ userId, params }) =>
        getOriginalCopy(userId, params.id),
      ),
    },
  },
});
