import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { undoTripChanges } from "@/server/services/trip-undo";
import { tripIdParams } from "@/server/services/trips";

export const Route = createFileRoute("/api/trips/$id/undo")({
  server: {
    handlers: {
      // Restores the trip as it was before the agent's latest edits.
      POST: apiHandler({ params: tripIdParams }, ({ userId, params }) =>
        undoTripChanges(userId, params.id),
      ),
    },
  },
});
