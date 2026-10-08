import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import {
  deleteTrip,
  getTrip,
  tripIdParams,
  updateTrip,
  updateTripInput,
} from "@/server/services/trips";

export const Route = createFileRoute("/api/trips/$id")({
  server: {
    handlers: {
      GET: apiHandler({ params: tripIdParams }, ({ userId, params }) => getTrip(userId, params.id)),
      PATCH: apiHandler(
        { params: tripIdParams, body: updateTripInput },
        ({ userId, params, body }) => updateTrip(userId, params.id, body),
      ),
      DELETE: apiHandler({ params: tripIdParams }, ({ userId, params }) =>
        deleteTrip(userId, params.id),
      ),
    },
  },
});
