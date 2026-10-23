import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { articleIdParams } from "@/server/services/library";
import { deleteNarration, getNarration, startNarration } from "@/server/services/narration";

const origin = (request: Request) => new URL(request.url).origin;

export const Route = createFileRoute("/api/narrations/$id")({
  server: {
    handlers: {
      // The article's narration (null when none); restarts a stalled run.
      GET: apiHandler({ params: articleIdParams }, ({ userId, params, request }) =>
        getNarration(userId, params.id, origin(request)),
      ),
      // Create audio: create, resume or re-create. Refusals come back as data.
      POST: apiHandler(
        { params: articleIdParams, rateLimit: "narration" },
        ({ userId, params, request }) => startNarration(userId, params.id, origin(request)),
      ),
      DELETE: apiHandler({ params: articleIdParams }, ({ userId, params }) =>
        deleteNarration(userId, params.id),
      ),
    },
  },
});
