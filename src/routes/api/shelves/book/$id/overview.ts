import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { fillBookOverview } from "@/server/services/lookup";
import { bookIdParams } from "@/server/services/shelves-write";

export const Route = createFileRoute("/api/shelves/book/$id/overview")({
  server: {
    handlers: {
      // Fill a missing synopsis from Open Library (never overwrites one already saved).
      POST: apiHandler({ params: bookIdParams, rateLimit: "lookup" }, ({ userId, params }) =>
        fillBookOverview(userId, params.id),
      ),
    },
  },
});
