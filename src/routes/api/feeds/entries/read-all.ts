import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { markAllRead, markAllReadInput } from "@/server/services/feeds";

export const Route = createFileRoute("/api/feeds/entries/read-all")({
  server: {
    handlers: {
      POST: apiHandler({ body: markAllReadInput }, ({ userId, body }) => markAllRead(userId, body)),
    },
  },
});
