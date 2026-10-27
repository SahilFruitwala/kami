import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { researchStatus } from "@/server/services/research/topics";

export const Route = createFileRoute("/api/research/status")({
  server: {
    handlers: {
      GET: apiHandler({}, ({ userId }) => researchStatus(userId)),
    },
  },
});
