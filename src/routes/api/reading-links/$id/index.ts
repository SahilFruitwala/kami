import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { deleteLink, linkIdParams, linkPatch, updateLink } from "@/server/services/reading-links";

export const Route = createFileRoute("/api/reading-links/$id/")({
  server: {
    handlers: {
      PATCH: apiHandler({ params: linkIdParams, body: linkPatch }, ({ userId, params, body }) =>
        updateLink(userId, params.id, body),
      ),
      DELETE: apiHandler({ params: linkIdParams }, ({ userId, params }) =>
        deleteLink(userId, params.id),
      ),
    },
  },
});
