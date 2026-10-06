import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { extractIdParams, runExtract, runInput } from "@/server/services/extracts";

export const Route = createFileRoute("/api/extracts/$id/run")({
  server: {
    handlers: {
      POST: apiHandler(
        { params: extractIdParams, body: runInput, rateLimit: "firecrawl" },
        ({ userId, params, body }) => runExtract(userId, params.id, body),
      ),
    },
  },
});
