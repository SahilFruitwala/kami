import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { debugDraft, debugDraftInput } from "@/server/services/research/debug";

export const Route = createFileRoute("/api/research/debug/runs/")({
  server: {
    handlers: {
      POST: apiHandler({ body: debugDraftInput }, ({ userId, body }) => debugDraft(userId, body)),
    },
  },
});
