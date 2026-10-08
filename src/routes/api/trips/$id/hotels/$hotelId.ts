import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import {
  removeTripHotel,
  tripHotelParams,
  updateHotelInput,
  updateTripHotel,
} from "@/server/services/trips";

export const Route = createFileRoute("/api/trips/$id/hotels/$hotelId")({
  server: {
    handlers: {
      PATCH: apiHandler(
        { params: tripHotelParams, body: updateHotelInput },
        ({ userId, params, body }) => updateTripHotel(userId, params.id, params.hotelId, body),
      ),
      DELETE: apiHandler({ params: tripHotelParams }, ({ userId, params }) =>
        removeTripHotel(userId, params.id, params.hotelId),
      ),
    },
  },
});
