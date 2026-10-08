import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { createTrip, createTripInput, listTrips } from "@/server/services/trips";

export const Route = createFileRoute("/api/trips/")({
  server: {
    handlers: {
      GET: apiHandler({}, ({ userId }) => listTrips(userId)),
      POST: apiHandler({ body: createTripInput }, ({ userId, body }) => createTrip(userId, body)),
    },
  },
});
