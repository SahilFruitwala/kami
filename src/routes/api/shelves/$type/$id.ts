import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { getShelfItem, shelfItemParams } from "@/server/services/shelves";
import { deleteShelfItem, setShelfItemStatus, statusBody } from "@/server/services/shelves-write";

export const Route = createFileRoute("/api/shelves/$type/$id")({
  server: {
    handlers: {
      GET: apiHandler({ params: shelfItemParams }, ({ userId, params }) =>
        getShelfItem(userId, params),
      ),
      PATCH: apiHandler({ params: shelfItemParams, body: statusBody }, ({ userId, params, body }) =>
        setShelfItemStatus(userId, { ...params, status: body.status }),
      ),
      DELETE: apiHandler({ params: shelfItemParams }, ({ userId, params }) =>
        deleteShelfItem(userId, params),
      ),
    },
  },
});
