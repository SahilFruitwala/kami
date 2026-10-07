import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { shelfTypeParams } from "@/server/services/shelves";
import { duplicatesQuery, findShelfDuplicates } from "@/server/services/shelves-write";

export const Route = createFileRoute("/api/shelves/$type/duplicates")({
  server: {
    handlers: {
      GET: apiHandler(
        { params: shelfTypeParams, query: duplicatesQuery },
        ({ userId, params, query }) => findShelfDuplicates(userId, { ...query, type: params.type }),
      ),
    },
  },
});
