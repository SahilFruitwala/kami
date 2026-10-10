import { createFileRoute } from "@tanstack/react-router";
import { aiStatus } from "@/server/ai";
import { apiHandler } from "@/server/http";

export const Route = createFileRoute("/api/ai/status")({
  server: {
    handlers: {
      GET: apiHandler({}, () => aiStatus()),
    },
  },
});
