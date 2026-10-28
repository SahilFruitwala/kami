import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiHandler } from "@/server/http";
import { researchReport } from "@/server/services/research/product";

const params = z.object({ id: z.string().min(1).max(100) });

export const Route = createFileRoute("/api/research/reports/$id")({
  server: {
    handlers: {
      GET: apiHandler({ params }, ({ userId, params }) => researchReport(userId, params.id)),
    },
  },
});
