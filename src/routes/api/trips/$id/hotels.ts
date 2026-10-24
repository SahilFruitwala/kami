import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { afterBoardWrite } from "@/server/services/trip-board-write";
import { addTripHotel, createHotelInput, tripIdParams } from "@/server/services/trips";

export const Route = createFileRoute("/api/trips/$id/hotels")({
  server: {
    handlers: {
      POST: apiHandler(
        { params: tripIdParams, body: createHotelInput },
        ({ userId, params, body }) =>
          afterBoardWrite(userId, params.id, () => addTripHotel(userId, params.id, body)),
      ),
    },
  },
});
