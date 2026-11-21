import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { fetchWatchProvidersBatch, watchProvidersBatchBody } from "@/server/services/lookup";

export const Route = createFileRoute("/api/lookup/watch-providers-batch")({
  server: {
    handlers: {
      POST: apiHandler({ body: watchProvidersBatchBody, rateLimit: "lookup" }, ({ body }) =>
        fetchWatchProvidersBatch(body),
      ),
    },
  },
});
