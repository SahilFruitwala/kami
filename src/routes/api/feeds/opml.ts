import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { exportOpml, importOpml, opmlInput } from "@/server/services/feeds";

export const Route = createFileRoute("/api/feeds/opml")({
  server: {
    handlers: {
      GET: apiHandler({}, ({ userId }) => exportOpml(userId)),
      POST: apiHandler({ body: opmlInput, rateLimit: "feeds" }, ({ userId, body }) =>
        importOpml(userId, body),
      ),
    },
  },
});
