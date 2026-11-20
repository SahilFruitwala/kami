import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { compassIdParams, milestonePatch, setMilestone } from "@/server/services/compass";

export const Route = createFileRoute("/api/compass/milestones/$id")({
  server: {
    handlers: {
      PATCH: apiHandler(
        { params: compassIdParams, body: milestonePatch },
        ({ userId, params, body }) => setMilestone(userId, params.id, body),
      ),
    },
  },
});
