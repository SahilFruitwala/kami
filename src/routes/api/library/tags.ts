import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { applyTagOpEverywhere, libraryTagOpBody } from "@/server/services/library";

export const Route = createFileRoute("/api/library/tags")({
  server: {
    handlers: {
      POST: apiHandler({ body: libraryTagOpBody }, ({ userId, body }) =>
        applyTagOpEverywhere(userId, body),
      ),
    },
  },
});
