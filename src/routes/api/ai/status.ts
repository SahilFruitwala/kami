import { createFileRoute } from "@tanstack/react-router";
import { aiConfigured } from "@/lib/llm.server.ts";
import { apiHandler } from "@/server/http";

export const Route = createFileRoute("/api/ai/status")({
  server: {
    handlers: {
      GET: apiHandler({}, () => ({ enabled: aiConfigured() })),
    },
  },
});
