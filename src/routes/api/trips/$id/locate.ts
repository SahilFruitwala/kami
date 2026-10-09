import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { locateInput, locateTripPlaces } from "@/server/services/trip-locate";
import { tripIdParams } from "@/server/services/trips";

export const Route = createFileRoute("/api/trips/$id/locate")({
  server: {
    handlers: {
      // Geocodes a small batch of unpinned plans and hotels (Nominatim).
      POST: apiHandler({ params: tripIdParams, body: locateInput }, ({ userId, params, body }) =>
        locateTripPlaces(userId, params.id, body),
      ),
    },
  },
});
