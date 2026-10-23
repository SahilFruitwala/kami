import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiHandler } from "@/server/http";
import { libraryItemBody, upsertLibraryItem } from "@/server/services/library";

// `fresh=1` marks a single new capture (not a sync or bulk import): its copy
// is tidied in the background once saved.
const upsertQuery = z.object({ fresh: z.literal("1").optional() });

export const Route = createFileRoute("/api/library/items/")({
  server: {
    handlers: {
      // Upsert: matches an existing work by id, canonical URL or URL.
      POST: apiHandler(
        { body: libraryItemBody, query: upsertQuery },
        async ({ userId, body, query }) => {
          const item = await upsertLibraryItem(userId, body);
          if (query.fresh && item.tidyState === "pending") {
            const { tidyInBackground } = await import("@/server/services/ai-articles");
            tidyInBackground(userId, item.id);
          }
          return item;
        },
      ),
    },
  },
});
