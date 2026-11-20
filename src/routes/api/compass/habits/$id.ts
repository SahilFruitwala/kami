import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { compassIdParams, deleteHabit, habitPatch, updateHabit } from "@/server/services/compass";

export const Route = createFileRoute("/api/compass/habits/$id")({
  server: {
    handlers: {
      PATCH: apiHandler({ params: compassIdParams, body: habitPatch }, ({ userId, params, body }) =>
        updateHabit(userId, params.id, body),
      ),
      DELETE: apiHandler({ params: compassIdParams }, ({ userId, params }) =>
        deleteHabit(userId, params.id),
      ),
    },
  },
});
