import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { reviewInput, saveReview } from "@/server/services/compass";

export const Route = createFileRoute("/api/compass/reviews")({
  server: {
    handlers: {
      PUT: apiHandler({ body: reviewInput }, ({ userId, body }) => saveReview(userId, body)),
    },
  },
});
