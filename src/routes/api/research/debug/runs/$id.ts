import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiHandler } from "@/server/http";
import { debugRun } from "@/server/services/research/debug";

const params = z.object({ id: z.string().min(1).max(100) });

export const Route = createFileRoute("/api/research/debug/runs/$id")({
  server: {
    handlers: {
      GET: apiHandler({ params }, ({ userId, params, request }) =>
        debugRun(userId, params.id, new URL(request.url).origin),
      ),
    },
  },
});
