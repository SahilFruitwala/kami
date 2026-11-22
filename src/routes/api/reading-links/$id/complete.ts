import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import {
  completeInput,
  completeLinkedMilestone,
  linkIdParams,
} from "@/server/services/reading-links";

export const Route = createFileRoute("/api/reading-links/$id/complete")({
  server: {
    handlers: {
      POST: apiHandler({ params: linkIdParams, body: completeInput }, ({ userId, params, body }) =>
        completeLinkedMilestone(userId, params.id, body),
      ),
    },
  },
});
