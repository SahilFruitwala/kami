import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { getQuarter, quarterParams } from "@/server/services/compass";

export const Route = createFileRoute("/api/compass/quarters/$quarter")({
  server: {
    handlers: {
      GET: apiHandler({ params: quarterParams }, ({ userId, params }) =>
        getQuarter(userId, params.quarter),
      ),
    },
  },
});
