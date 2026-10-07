import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { fetchWatchProviders, watchProvidersQuery } from "@/server/services/lookup";

export const Route = createFileRoute("/api/lookup/watch-providers")({
  server: {
    handlers: {
      GET: apiHandler({ query: watchProvidersQuery, rateLimit: "lookup" }, ({ query }) =>
        fetchWatchProviders(query),
      ),
    },
  },
});
