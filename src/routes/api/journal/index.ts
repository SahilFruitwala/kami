import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { listJournalEntries } from "@/server/services/journal";

export const Route = createFileRoute("/api/journal/")({
  server: {
    handlers: {
      GET: apiHandler({}, ({ userId }) => listJournalEntries(userId)),
    },
  },
});
