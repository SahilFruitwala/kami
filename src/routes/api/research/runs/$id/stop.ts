import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiHandler } from "@/server/http";
import { stopResearchRun } from "@/server/services/research/product";

const params = z.object({ id: z.string().min(1).max(100) });

export const Route = createFileRoute("/api/research/runs/$id/stop")({
  server: {
    handlers: {
      POST: apiHandler({ params }, ({ userId, params, request }) =>
        stopResearchRun(userId, params.id, new URL(request.url).origin),
      ),
    },
  },
});
