import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiHandler } from "@/server/http";
import { ideaPatchInput, patchIdea, researchIdea } from "@/server/services/research/product";

const params = z.object({ id: z.string().min(1).max(100) });

export const Route = createFileRoute("/api/research/ideas/$id")({
  server: {
    handlers: {
      GET: apiHandler({ params }, ({ userId, params }) => researchIdea(userId, params.id)),
      PATCH: apiHandler({ params, body: ideaPatchInput }, ({ userId, params, body }) =>
        patchIdea(userId, params.id, body),
      ),
    },
  },
});
