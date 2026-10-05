import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { importBody, importJournalEntries } from "@/server/services/journal";

export const Route = createFileRoute("/api/journal/import")({
  server: {
    handlers: {
      POST: apiHandler({ body: importBody }, ({ userId, body }) =>
        importJournalEntries(userId, body),
      ),
    },
  },
});
