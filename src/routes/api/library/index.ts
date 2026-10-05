import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { libraryPageQuery, loadLibraryPage } from "@/server/services/library";
import { wipeLibrary } from "@/server/services/library-folders";

export const Route = createFileRoute("/api/library/")({
  server: {
    handlers: {
      GET: apiHandler({ query: libraryPageQuery }, ({ userId, query }) =>
        loadLibraryPage(userId, query),
      ),
      DELETE: apiHandler({}, ({ userId }) => wipeLibrary(userId)),
    },
  },
});
