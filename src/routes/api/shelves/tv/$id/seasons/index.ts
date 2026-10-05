import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { getShowSeasons, showParams } from "@/server/services/episodes";

export const Route = createFileRoute("/api/shelves/tv/$id/seasons/")({
  server: {
    handlers: {
      GET: apiHandler({ params: showParams, rateLimit: "lookup" }, ({ userId, params }) =>
        getShowSeasons(userId, params.id),
      ),
    },
  },
});
