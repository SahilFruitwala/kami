import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiHandler } from "@/server/http";
import { debugStart, debugStartInput } from "@/server/services/research/debug";

const params = z.object({ id: z.string().min(1).max(100) });

export const Route = createFileRoute("/api/research/debug/runs/$id/start")({
  server: {
    handlers: {
      POST: apiHandler({ params, body: debugStartInput }, ({ userId, params, body, request }) =>
        debugStart(userId, params.id, body, new URL(request.url).origin),
      ),
    },
  },
});
