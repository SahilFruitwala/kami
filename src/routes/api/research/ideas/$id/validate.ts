import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiHandler } from "@/server/http";
import { draftValidateRun, validateInput } from "@/server/services/research/product";

const params = z.object({ id: z.string().min(1).max(100) });

export const Route = createFileRoute("/api/research/ideas/$id/validate")({
  server: {
    handlers: {
      POST: apiHandler({ params, body: validateInput }, ({ userId, params, body }) =>
        draftValidateRun(userId, params.id, body),
      ),
    },
  },
});
