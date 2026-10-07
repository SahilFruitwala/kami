import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { ensureInbox, inboxInput } from "@/server/services/feeds";

export const Route = createFileRoute("/api/feeds/inbox")({
  server: {
    handlers: {
      POST: apiHandler({ body: inboxInput }, ({ userId, body }) => ensureInbox(userId, body)),
    },
  },
});
