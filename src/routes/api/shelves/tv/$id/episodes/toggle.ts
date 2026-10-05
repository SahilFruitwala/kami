import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { showParams, toggleEpisode, toggleEpisodeBody } from "@/server/services/episodes";

export const Route = createFileRoute("/api/shelves/tv/$id/episodes/toggle")({
  server: {
    handlers: {
      POST: apiHandler(
        { params: showParams, body: toggleEpisodeBody },
        ({ userId, params, body }) => toggleEpisode(userId, { itemId: params.id, ...body }),
      ),
    },
  },
});
