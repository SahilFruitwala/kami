import { createFileRoute } from "@tanstack/react-router";
import { narrationConfigured } from "@/lib/narration-config.server.ts";
import { userCanUseAi } from "@/server/ai";
import { apiHandler } from "@/server/http";

export const Route = createFileRoute("/api/ai/status")({
  server: {
    handlers: {
      GET: apiHandler({}, async ({ userId }) => ({
        enabled: await userCanUseAi(userId),
        narration: narrationConfigured(),
      })),
    },
  },
});
