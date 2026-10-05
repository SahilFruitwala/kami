import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { importLibrarySnapshot, importSnapshotBody } from "@/server/services/library-folders";

export const Route = createFileRoute("/api/library/import")({
  server: {
    handlers: {
      POST: apiHandler({ body: importSnapshotBody }, ({ userId, body }) =>
        importLibrarySnapshot(userId, body),
      ),
    },
  },
});
