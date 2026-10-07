import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { importBooks, importBooksBody } from "@/server/services/shelves-write";

export const Route = createFileRoute("/api/shelves/book/import")({
  server: {
    handlers: {
      // Bulk-add books parsed from a Goodreads library export.
      POST: apiHandler({ body: importBooksBody }, ({ userId, body }) => importBooks(userId, body)),
    },
  },
});
