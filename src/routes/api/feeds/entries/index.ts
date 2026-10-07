import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { entriesQuery, listEntries } from "@/server/services/feeds";

export const Route = createFileRoute("/api/feeds/entries/")({
  server: {
    handlers: {
      GET: apiHandler({ query: entriesQuery }, ({ userId, query }) => listEntries(userId, query)),
    },
  },
});
