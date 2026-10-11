import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { saveArticleByUrl, saveUrlInput } from "@/server/services/library-save";

export const Route = createFileRoute("/api/library/save")({
  server: {
    handlers: {
      // Fetch + extract + store one URL (web paste box and native apps).
      POST: apiHandler({ body: saveUrlInput, rateLimit: "extract" }, ({ userId, body }) =>
        saveArticleByUrl(userId, body),
      ),
    },
  },
});
