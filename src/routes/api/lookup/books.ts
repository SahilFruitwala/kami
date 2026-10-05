import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { bookSearchQuery, searchBooks } from "@/server/services/lookup";

export const Route = createFileRoute("/api/lookup/books")({
  server: {
    handlers: {
      GET: apiHandler({ query: bookSearchQuery, rateLimit: "lookup" }, ({ query }) =>
        searchBooks(query),
      ),
    },
  },
});
