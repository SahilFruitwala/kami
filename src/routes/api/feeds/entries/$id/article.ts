import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { entryArticle, feedIdParams } from "@/server/services/feeds";

export const Route = createFileRoute("/api/feeds/entries/$id/article")({
  server: {
    handlers: {
      POST: apiHandler({ params: feedIdParams }, ({ userId, params }) =>
        entryArticle(userId, params.id),
      ),
    },
  },
});
