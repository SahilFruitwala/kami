import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { draftDiscoverRun, draftInput } from "@/server/services/research/product";

export const Route = createFileRoute("/api/research/runs/")({
  server: {
    handlers: {
      POST: apiHandler({ body: draftInput }, ({ userId, body }) => draftDiscoverRun(userId, body)),
    },
  },
});
