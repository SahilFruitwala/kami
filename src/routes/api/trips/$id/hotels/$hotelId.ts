import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { afterBoardWrite } from "@/server/services/trip-board-write";
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
        ({ userId, params, body }) =>
          afterBoardWrite(userId, params.id, () =>
            updateTripHotel(userId, params.id, params.hotelId, body),
          ),
      ),
      DELETE: apiHandler({ params: tripHotelParams }, ({ userId, params }) =>
        afterBoardWrite(userId, params.id, () =>
          removeTripHotel(userId, params.id, params.hotelId),
        ),
      ),
    },
  },
});
