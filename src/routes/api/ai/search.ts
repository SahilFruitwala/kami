import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { searchLibrary, searchQuery } from "@/server/services/ai-library";

export const Route = createFileRoute("/api/ai/search")({
  server: {
    handlers: {
      GET: apiHandler({ query: searchQuery, rateLimit: "ai" }, ({ userId, query }) =>
        searchLibrary(userId, query),
      ),
    },
  },
});
