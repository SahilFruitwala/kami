import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { extractArticle, extractInput } from "@/server/services/articles";

export const Route = createFileRoute("/api/articles/extract")({
  server: {
    handlers: {
      POST: apiHandler({ body: extractInput, rateLimit: "extract" }, ({ userId, body }) =>
        extractArticle(userId, body),
      ),
    },
  },
});
