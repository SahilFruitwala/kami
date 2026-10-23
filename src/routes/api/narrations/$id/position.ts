import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { articleIdParams } from "@/server/services/library";
import { positionBody, saveNarrationPosition } from "@/server/services/narration";

export const Route = createFileRoute("/api/narrations/$id/position")({
  server: {
    handlers: {
      PUT: apiHandler({ params: articleIdParams, body: positionBody }, ({ userId, params, body }) =>
        saveNarrationPosition(userId, params.id, body.seconds),
      ),
    },
  },
});
