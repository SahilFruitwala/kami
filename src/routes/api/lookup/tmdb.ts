import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { searchTmdb, tmdbSearchQuery } from "@/server/services/lookup";

export const Route = createFileRoute("/api/lookup/tmdb")({
  server: {
    handlers: {
      GET: apiHandler({ query: tmdbSearchQuery, rateLimit: "lookup" }, ({ query }) =>
        searchTmdb(query),
      ),
    },
  },
});
