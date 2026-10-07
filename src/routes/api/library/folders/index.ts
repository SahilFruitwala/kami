import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { addFolderBody, addLibraryFolder } from "@/server/services/library-folders";

export const Route = createFileRoute("/api/library/folders/")({
  server: {
    handlers: {
      POST: apiHandler({ body: addFolderBody }, ({ userId, body }) =>
        addLibraryFolder(userId, body),
      ),
    },
  },
});
