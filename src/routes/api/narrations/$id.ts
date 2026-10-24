import { createFileRoute } from "@tanstack/react-router";
import { startBody } from "@/lib/narration-voices";
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
        { params: articleIdParams, body: startBody, rateLimit: "narration" },
        ({ userId, params, body, request }) =>
          startNarration(userId, params.id, origin(request), body.voice),
      ),
      DELETE: apiHandler({ params: articleIdParams }, ({ userId, params }) =>
        deleteNarration(userId, params.id),
      ),
    },
  },
});
