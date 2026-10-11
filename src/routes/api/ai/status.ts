import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { getAiStatus } from "@/server/services/ai-library";

export const Route = createFileRoute("/api/ai/status")({
  server: {
    handlers: {
      GET: apiHandler({}, () => getAiStatus()),
    },
  },
});
