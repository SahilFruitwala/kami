import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { getCompass } from "@/server/services/compass";

export const Route = createFileRoute("/api/compass/")({
  server: {
    handlers: {
      GET: apiHandler({}, ({ userId }) => getCompass(userId)),
    },
  },
});
