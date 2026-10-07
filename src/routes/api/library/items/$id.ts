import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import {
  articleIdParams,
  getArticle,
  libraryItemPatch,
  patchLibraryItem,
  removeLibraryItem,
} from "@/server/services/library";

export const Route = createFileRoute("/api/library/items/$id")({
  server: {
    handlers: {
      GET: apiHandler({ params: articleIdParams }, ({ userId, params }) =>
        getArticle(userId, params.id),
      ),
      PATCH: apiHandler(
        { params: articleIdParams, body: libraryItemPatch },
        ({ userId, params, body }) => patchLibraryItem(userId, params.id, body),
      ),
      DELETE: apiHandler({ params: articleIdParams }, ({ userId, params }) =>
        removeLibraryItem(userId, params.id),
      ),
    },
  },
});
