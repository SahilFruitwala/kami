import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { draftHighlightNote, draftNoteInput } from "@/server/services/ai-vault";

export const Route = createFileRoute("/api/ai/vault/note")({
  server: {
    handlers: {
      POST: apiHandler({ body: draftNoteInput, rateLimit: "ai" }, ({ userId, body }) =>
        draftHighlightNote(userId, body),
      ),
    },
  },
});
