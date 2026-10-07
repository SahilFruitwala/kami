import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { refreshInput, refreshMyFeeds } from "@/server/services/feeds";

export const Route = createFileRoute("/api/feeds/refresh")({
  server: {
    handlers: {
      POST: apiHandler({ body: refreshInput, rateLimit: "feeds" }, ({ userId, body }) =>
        refreshMyFeeds(userId, body),
      ),
    },
  },
});
