import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiHandler } from "@/server/http";
import { debugStop } from "@/server/services/research/debug";

const params = z.object({ id: z.string().min(1).max(100) });

export const Route = createFileRoute("/api/research/debug/runs/$id/stop")({
  server: {
    handlers: {
      POST: apiHandler({ params }, ({ userId, params, request }) =>
        debugStop(userId, params.id, new URL(request.url).origin),
      ),
    },
  },
});
