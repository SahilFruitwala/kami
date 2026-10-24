import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { afterBoardWrite } from "@/server/services/trip-board-write";
import { addTripItem, createItemInput, tripIdParams } from "@/server/services/trips";

export const Route = createFileRoute("/api/trips/$id/items")({
  server: {
    handlers: {
      POST: apiHandler(
        { params: tripIdParams, body: createItemInput },
        ({ userId, params, body }) =>
          afterBoardWrite(userId, params.id, () => addTripItem(userId, params.id, body)),
      ),
    },
  },
});
