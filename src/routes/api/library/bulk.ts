import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { bulkSaveBody, bulkSaveLinks } from "@/server/services/library-bulk";

export const Route = createFileRoute("/api/library/bulk")({
  server: {
    handlers: {
      // Rate limiting is per URL inside the service (cost = URLs to extract).
      POST: apiHandler({ body: bulkSaveBody }, ({ userId, body }) => bulkSaveLinks(userId, body)),
    },
  },
});
