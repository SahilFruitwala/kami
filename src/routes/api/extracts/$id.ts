import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import {
  extractIdParams,
  removeExtractSource,
  updateExtractSource,
  updateSourceInput,
} from "@/server/services/extracts";

export const Route = createFileRoute("/api/extracts/$id")({
  server: {
    handlers: {
      PATCH: apiHandler(
        { params: extractIdParams, body: updateSourceInput },
        ({ userId, params, body }) => updateExtractSource(userId, params.id, body),
      ),
      DELETE: apiHandler({ params: extractIdParams }, ({ userId, params }) =>
        removeExtractSource(userId, params.id),
      ),
    },
  },
});
