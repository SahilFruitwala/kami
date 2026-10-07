import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import {
  createExtractSource,
  createSourceInput,
  getExtractsOverview,
} from "@/server/services/extracts";

export const Route = createFileRoute("/api/extracts/")({
  server: {
    handlers: {
      GET: apiHandler({}, ({ userId }) => getExtractsOverview(userId)),
      POST: apiHandler({ body: createSourceInput }, ({ userId, body }) =>
        createExtractSource(userId, body),
      ),
    },
  },
});
