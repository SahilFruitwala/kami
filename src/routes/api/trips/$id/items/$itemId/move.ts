import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { afterBoardWrite } from "@/server/services/trip-board-write";
import { moveItemInput, moveTripItem, tripItemParams } from "@/server/services/trips";

export const Route = createFileRoute("/api/trips/$id/items/$itemId/move")({
  server: {
    handlers: {
      POST: apiHandler(
        { params: tripItemParams, body: moveItemInput },
        ({ userId, params, body }) =>
          afterBoardWrite(userId, params.id, () =>
            moveTripItem(userId, params.id, params.itemId, body.direction),
          ),
      ),
    },
  },
});
