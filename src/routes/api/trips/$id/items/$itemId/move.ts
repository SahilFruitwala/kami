import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { moveItemInput, moveTripItem, tripItemParams } from "@/server/services/trips";

export const Route = createFileRoute("/api/trips/$id/items/$itemId/move")({
  server: {
    handlers: {
      POST: apiHandler(
        { params: tripItemParams, body: moveItemInput },
        ({ userId, params, body }) =>
          moveTripItem(userId, params.id, params.itemId, body.direction),
      ),
    },
  },
});
