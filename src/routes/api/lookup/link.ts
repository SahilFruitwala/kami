import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { fetchLinkPreview, linkPreviewQuery } from "@/server/services/lookup";

export const Route = createFileRoute("/api/lookup/link")({
  server: {
    handlers: {
      GET: apiHandler({ query: linkPreviewQuery, rateLimit: "lookup" }, ({ query }) =>
        fetchLinkPreview(query),
      ),
    },
  },
});
