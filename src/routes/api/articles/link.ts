import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { linkInput, saveLinkArticle } from "@/server/services/articles";

export const Route = createFileRoute("/api/articles/link")({
  server: {
    handlers: {
      POST: apiHandler({ body: linkInput }, ({ body }) => saveLinkArticle(body)),
    },
  },
});
