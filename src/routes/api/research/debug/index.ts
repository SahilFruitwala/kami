import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { debugOverview } from "@/server/services/research/debug";

export const Route = createFileRoute("/api/research/debug/")({
  server: {
    handlers: {
      GET: apiHandler({}, ({ userId }) => debugOverview(userId)),
    },
  },
});
