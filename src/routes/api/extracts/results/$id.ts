import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { discardExtractResult, extractIdParams } from "@/server/services/extracts";

export const Route = createFileRoute("/api/extracts/results/$id")({
  server: {
    handlers: {
      DELETE: apiHandler({ params: extractIdParams }, ({ userId, params }) =>
        discardExtractResult(userId, params.id),
      ),
    },
  },
});
