import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { createGoal, goalInput } from "@/server/services/compass";

export const Route = createFileRoute("/api/compass/goals/")({
  server: {
    handlers: {
      POST: apiHandler({ body: goalInput }, ({ userId, body }) => createGoal(userId, body)),
    },
  },
});
