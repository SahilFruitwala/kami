import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { createLink, linkInput, linkQuery, listLinks } from "@/server/services/reading-links";

export const Route = createFileRoute("/api/reading-links/")({
  server: {
    handlers: {
      GET: apiHandler({ query: linkQuery }, ({ userId, query }) => listLinks(userId, query)),
      POST: apiHandler({ body: linkInput }, ({ userId, body }) => createLink(userId, body)),
    },
  },
});
