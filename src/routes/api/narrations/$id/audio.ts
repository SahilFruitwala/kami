import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { articleIdParams } from "@/server/services/library";
import { narrationAudioUrl } from "@/server/services/narration";

export const Route = createFileRoute("/api/narrations/$id/audio")({
  server: {
    handlers: {
      // A short-lived presigned URL for the owner's finished audio.
      GET: apiHandler({ params: articleIdParams }, ({ userId, params }) =>
        narrationAudioUrl(userId, params.id),
      ),
    },
  },
});
