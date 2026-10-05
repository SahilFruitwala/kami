import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import {
  folderIdParams,
  removeLibraryFolder,
  renameFolderBody,
  renameLibraryFolder,
} from "@/server/services/library-folders";

export const Route = createFileRoute("/api/library/folders/$id")({
  server: {
    handlers: {
      PATCH: apiHandler(
        { params: folderIdParams, body: renameFolderBody },
        ({ userId, params, body }) => renameLibraryFolder(userId, params.id, body),
      ),
      DELETE: apiHandler({ params: folderIdParams }, ({ userId, params }) =>
        removeLibraryFolder(userId, params.id),
      ),
    },
  },
});
