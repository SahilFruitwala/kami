import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { compassIdParams, dropGoal, goalInput, updateGoal } from "@/server/services/compass";

export const Route = createFileRoute("/api/compass/goals/$id")({
  server: {
    handlers: {
      PATCH: apiHandler({ params: compassIdParams, body: goalInput }, ({ userId, params, body }) =>
        updateGoal(userId, params.id, body),
      ),
      DELETE: apiHandler({ params: compassIdParams }, ({ userId, params }) =>
        dropGoal(userId, params.id),
      ),
    },
  },
});
