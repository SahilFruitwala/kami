import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { exportLibrary } from "@/server/services/library";

export const Route = createFileRoute("/api/library/export")({
  server: {
    handlers: {
      GET: apiHandler({}, ({ userId }) => exportLibrary(userId)),
    },
  },
});
