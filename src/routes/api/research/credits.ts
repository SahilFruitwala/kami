import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { researchCredits } from "@/server/services/research/topics";

export const Route = createFileRoute("/api/research/credits")({
  server: {
    handlers: {
      GET: apiHandler({}, ({ userId }) => researchCredits(userId)),
    },
  },
});
