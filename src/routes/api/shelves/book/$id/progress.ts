import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { bookIdParams, bookProgressBody, setBookProgress } from "@/server/services/shelves-write";

export const Route = createFileRoute("/api/shelves/book/$id/progress")({
  server: {
    handlers: {
      PUT: apiHandler(
        { params: bookIdParams, body: bookProgressBody },
        ({ userId, params, body }) => setBookProgress(userId, params.id, body),
      ),
    },
  },
});
