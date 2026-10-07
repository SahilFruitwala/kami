import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { getShelfCounts } from "@/server/services/shelves";

export const Route = createFileRoute("/api/shelves/counts")({
  server: {
    handlers: {
      GET: apiHandler({}, ({ userId }) => getShelfCounts(userId)),
    },
  },
});
