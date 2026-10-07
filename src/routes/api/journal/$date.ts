import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiHandler } from "@/server/http";
import { dateKeySchema, entryBody, upsertJournalEntry } from "@/server/services/journal";

const params = z.object({ date: dateKeySchema });

export const Route = createFileRoute("/api/journal/$date")({
  server: {
    handlers: {
      PUT: apiHandler({ params, body: entryBody }, ({ userId, params, body }) =>
        upsertJournalEntry(userId, { date: params.date, ...body }),
      ),
    },
  },
});
