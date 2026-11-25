import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { getShelfItem, shelfItemParams } from "@/server/services/shelves";
import {
  deleteShelfItem,
  setShelfItemStatus,
  shelfPatchBody,
  updateBook,
} from "@/server/services/shelves-write";

export const Route = createFileRoute("/api/shelves/$type/$id")({
  server: {
    handlers: {
      GET: apiHandler({ params: shelfItemParams }, ({ userId, params }) =>
        getShelfItem(userId, params),
      ),
      PATCH: apiHandler(
        { params: shelfItemParams, body: shelfPatchBody },
        ({ userId, params, body }) =>
          "status" in body
            ? setShelfItemStatus(userId, { ...params, status: body.status })
            : updateBook(userId, params, body),
      ),
      DELETE: apiHandler({ params: shelfItemParams }, ({ userId, params }) =>
        deleteShelfItem(userId, params),
      ),
    },
  },
});
