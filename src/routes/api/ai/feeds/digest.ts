import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { digestInput, getFeedDigest, makeFeedDigest } from "@/server/services/ai-feeds";

export const Route = createFileRoute("/api/ai/feeds/digest")({
  server: {
    handlers: {
      GET: apiHandler({ query: digestInput }, ({ userId, query }) => getFeedDigest(userId, query)),
      POST: apiHandler({ body: digestInput, rateLimit: "ai" }, ({ userId, body }) =>
        makeFeedDigest(userId, body),
      ),
    },
  },
});
