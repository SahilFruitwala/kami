import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { setShowWatched, showParams, showWatchedBody } from "@/server/services/episodes";

export const Route = createFileRoute("/api/shelves/tv/$id/watched")({
  server: {
    handlers: {
      // Marking watched pulls every season from TMDB — counts as a lookup.
      PUT: apiHandler(
        { params: showParams, body: showWatchedBody, rateLimit: "lookup" },
        ({ userId, params, body }) =>
          setShowWatched(userId, { itemId: params.id, watched: body.watched }),
      ),
    },
  },
});
