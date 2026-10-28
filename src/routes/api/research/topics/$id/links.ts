import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiHandler } from "@/server/http";
import { linkInput, pasteLink } from "@/server/services/research/product";

const params = z.object({ id: z.string().min(1).max(100) });

export const Route = createFileRoute("/api/research/topics/$id/links")({
  server: {
    handlers: {
      POST: apiHandler({ params, body: linkInput }, ({ userId, params, body, request }) =>
        pasteLink(userId, params.id, body.url, new URL(request.url).origin),
      ),
    },
  },
});
