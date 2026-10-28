import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { mergeInput, mergeResearchIdeas } from "@/server/services/research/product";

export const Route = createFileRoute("/api/research/ideas/merge")({
  server: {
    handlers: {
      POST: apiHandler({ body: mergeInput }, ({ userId, body }) =>
        mergeResearchIdeas(userId, body),
      ),
    },
  },
});
