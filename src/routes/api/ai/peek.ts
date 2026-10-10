import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { peekInput, peekPage } from "@/server/services/ai-extract";

export const Route = createFileRoute("/api/ai/peek")({
  server: {
    handlers: {
      POST: apiHandler({ body: peekInput, rateLimit: "ai" }, ({ userId, body }) =>
        peekPage(userId, body),
      ),
    },
  },
});
