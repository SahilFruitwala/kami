import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { acceptExtractResult, extractIdParams } from "@/server/services/extracts";

export const Route = createFileRoute("/api/extracts/results/$id/accept")({
  server: {
    handlers: {
      POST: apiHandler({ params: extractIdParams }, ({ userId, params }) =>
        acceptExtractResult(userId, params.id),
      ),
    },
  },
});
