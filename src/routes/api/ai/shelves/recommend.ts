import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { recommendInput, recommendShelf } from "@/server/services/ai-shelves";

export const Route = createFileRoute("/api/ai/shelves/recommend")({
  server: {
    handlers: {
      POST: apiHandler({ body: recommendInput, rateLimit: "ai" }, ({ userId, body }) =>
        recommendShelf(userId, body),
      ),
    },
  },
});
