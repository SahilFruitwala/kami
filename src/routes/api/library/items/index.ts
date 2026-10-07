import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { libraryItemBody, upsertLibraryItem } from "@/server/services/library";

export const Route = createFileRoute("/api/library/items/")({
  server: {
    handlers: {
      // Upsert: matches an existing work by id, canonical URL or URL.
      POST: apiHandler({ body: libraryItemBody }, ({ userId, body }) =>
        upsertLibraryItem(userId, body),
      ),
    },
  },
});
