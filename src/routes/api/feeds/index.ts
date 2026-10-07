import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { addFeed, addFeedInput, getFeedsOverview } from "@/server/services/feeds";

export const Route = createFileRoute("/api/feeds/")({
  server: {
    handlers: {
      GET: apiHandler({}, ({ userId }) => getFeedsOverview(userId)),
      POST: apiHandler({ body: addFeedInput, rateLimit: "feeds" }, ({ userId, body }) =>
        addFeed(userId, body),
      ),
    },
  },
});
