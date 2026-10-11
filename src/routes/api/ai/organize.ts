import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { organizeBatch, organizeBody } from "@/server/services/ai-organize";

export const Route = createFileRoute("/api/ai/organize")({
  server: {
    handlers: {
      // Rate limiting is per article inside the service (one model call each).
      POST: apiHandler({ body: organizeBody }, ({ userId, body }) => organizeBatch(userId, body)),
    },
  },
});
