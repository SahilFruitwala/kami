import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { markEntriesRead, markReadInput } from "@/server/services/feeds";

export const Route = createFileRoute("/api/feeds/entries/read")({
  server: {
    handlers: {
      POST: apiHandler({ body: markReadInput }, ({ userId, body }) =>
        markEntriesRead(userId, body),
      ),
    },
  },
});
