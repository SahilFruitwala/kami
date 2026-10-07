import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { feedIdParams, removeFeed, renameFeed, renameFeedInput } from "@/server/services/feeds";

export const Route = createFileRoute("/api/feeds/$id")({
  server: {
    handlers: {
      PATCH: apiHandler(
        { params: feedIdParams, body: renameFeedInput },
        ({ userId, params, body }) => renameFeed(userId, params.id, body),
      ),
      DELETE: apiHandler({ params: feedIdParams }, ({ userId, params }) =>
        removeFeed(userId, params.id),
      ),
    },
  },
});
