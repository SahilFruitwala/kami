import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import {
  removeTripItem,
  tripItemParams,
  updateItemInput,
  updateTripItem,
} from "@/server/services/trips";

export const Route = createFileRoute("/api/trips/$id/items/$itemId")({
  server: {
    handlers: {
      PATCH: apiHandler(
        { params: tripItemParams, body: updateItemInput },
        ({ userId, params, body }) => updateTripItem(userId, params.id, params.itemId, body),
      ),
      DELETE: apiHandler({ params: tripItemParams }, ({ userId, params }) =>
        removeTripItem(userId, params.id, params.itemId),
      ),
    },
  },
});
