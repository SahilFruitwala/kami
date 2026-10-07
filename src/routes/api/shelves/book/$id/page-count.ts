import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { fillBookPageCount } from "@/server/services/lookup";
import { bookIdParams } from "@/server/services/shelves-write";

export const Route = createFileRoute("/api/shelves/book/$id/page-count")({
  server: {
    handlers: {
      // Fill a missing page count from Open Library (never overwrites one typed in).
      POST: apiHandler({ params: bookIdParams, rateLimit: "lookup" }, ({ userId, params }) =>
        fillBookPageCount(userId, params.id),
      ),
    },
  },
});
