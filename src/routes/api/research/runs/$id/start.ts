import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiHandler } from "@/server/http";
import { startDiscoverRun, startInput } from "@/server/services/research/product";

const params = z.object({ id: z.string().min(1).max(100) });

export const Route = createFileRoute("/api/research/runs/$id/start")({
  server: {
    handlers: {
      POST: apiHandler({ params, body: startInput }, ({ userId, params, body, request }) =>
        startDiscoverRun(userId, params.id, body, new URL(request.url).origin),
      ),
    },
  },
});
