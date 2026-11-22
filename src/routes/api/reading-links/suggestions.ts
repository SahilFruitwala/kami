import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { suggestLinks, suggestionQuery } from "@/server/services/reading-links";

export const Route = createFileRoute("/api/reading-links/suggestions")({
  server: {
    handlers: {
      GET: apiHandler({ query: suggestionQuery }, ({ userId, query }) =>
        suggestLinks(userId, query),
      ),
    },
  },
});
