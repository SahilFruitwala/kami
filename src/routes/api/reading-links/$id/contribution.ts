import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import {
  applyContribution,
  contributionInput,
  linkIdParams,
} from "@/server/services/reading-links";

export const Route = createFileRoute("/api/reading-links/$id/contribution")({
  server: {
    handlers: {
      POST: apiHandler(
        { params: linkIdParams, body: contributionInput },
        ({ userId, params, body }) => applyContribution(userId, params.id, body),
      ),
    },
  },
});
