import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiHandler } from "@/server/http";
import { ideasQuery, listTopicIdeas } from "@/server/services/research/product";

const params = z.object({ id: z.string().min(1).max(100) });

export const Route = createFileRoute("/api/research/topics/$id/ideas")({
  server: {
    handlers: {
      GET: apiHandler({ params, query: ideasQuery }, ({ userId, params, query }) =>
        listTopicIdeas(userId, params.id, query.status),
      ),
    },
  },
});
