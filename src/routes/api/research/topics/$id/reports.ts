import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiHandler } from "@/server/http";
import { listTopicReports } from "@/server/services/research/product";

const params = z.object({ id: z.string().min(1).max(100) });

export const Route = createFileRoute("/api/research/topics/$id/reports")({
  server: {
    handlers: {
      GET: apiHandler({ params }, ({ userId, params }) => listTopicReports(userId, params.id)),
    },
  },
});
