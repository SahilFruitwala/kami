import { createFileRoute } from "@tanstack/react-router";
import { apiHandler, json } from "@/server/http";
import { listShelfItems, shelfListQuery, shelfTypeParams } from "@/server/services/shelves";
import { addShelfItem, addShelfItemBody } from "@/server/services/shelves-write";

export const Route = createFileRoute("/api/shelves/$type/")({
  server: {
    handlers: {
      GET: apiHandler(
        { params: shelfTypeParams, query: shelfListQuery },
        ({ userId, params, query }) => listShelfItems(userId, { ...query, type: params.type }),
      ),
      POST: apiHandler(
        { params: shelfTypeParams, body: addShelfItemBody },
        async ({ userId, params, body }) =>
          json(await addShelfItem(userId, { ...body, type: params.type }), { status: 201 }),
      ),
    },
  },
});
