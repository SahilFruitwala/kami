import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import {
  getSeasonEpisodes,
  seasonParams,
  seasonWatchedBody,
  setSeasonWatched,
} from "@/server/services/episodes";

export const Route = createFileRoute("/api/shelves/tv/$id/seasons/$season")({
  server: {
    handlers: {
      GET: apiHandler({ params: seasonParams, rateLimit: "lookup" }, ({ userId, params }) =>
        getSeasonEpisodes(userId, { itemId: params.id, season: params.season }),
      ),
      // Bulk tick / untick the given episode numbers of one season.
      PUT: apiHandler(
        { params: seasonParams, body: seasonWatchedBody },
        ({ userId, params, body }) =>
          setSeasonWatched(userId, { itemId: params.id, season: params.season, ...body }),
      ),
    },
  },
});
