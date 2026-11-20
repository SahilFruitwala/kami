import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { logInput, putLog } from "@/server/services/compass";

export const Route = createFileRoute("/api/compass/logs")({
  server: {
    handlers: {
      PUT: apiHandler({ body: logInput }, ({ userId, body }) => putLog(userId, body)),
    },
  },
});
