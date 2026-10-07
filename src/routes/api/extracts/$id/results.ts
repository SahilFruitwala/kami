import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { extractIdParams, listExtractResults } from "@/server/services/extracts";

export const Route = createFileRoute("/api/extracts/$id/results")({
  server: {
    handlers: {
      GET: apiHandler({ params: extractIdParams }, ({ userId, params }) =>
        listExtractResults(userId, params.id),
      ),
    },
  },
});
