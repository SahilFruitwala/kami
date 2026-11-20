import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { closeQuarter, retroInput } from "@/server/services/compass";

export const Route = createFileRoute("/api/compass/retro")({
  server: {
    handlers: {
      POST: apiHandler({ body: retroInput }, ({ userId, body }) => closeQuarter(userId, body)),
    },
  },
});
