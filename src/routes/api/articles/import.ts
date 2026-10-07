import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { importArticle, importInput } from "@/server/services/articles";

export const Route = createFileRoute("/api/articles/import")({
  server: {
    handlers: {
      POST: apiHandler({ body: importInput, rateLimit: "extract" }, ({ body }) =>
        importArticle(body),
      ),
    },
  },
});
