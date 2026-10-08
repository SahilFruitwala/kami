import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { addTripHotel, createHotelInput, tripIdParams } from "@/server/services/trips";

export const Route = createFileRoute("/api/trips/$id/hotels")({
  server: {
    handlers: {
      POST: apiHandler(
        { params: tripIdParams, body: createHotelInput },
        ({ userId, params, body }) => addTripHotel(userId, params.id, body),
      ),
    },
  },
});
