import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { getWeeklyRecap, makeWeeklyRecap } from "@/server/services/ai-recap";

export const Route = createFileRoute("/api/ai/recap")({
  server: {
    handlers: {
      GET: apiHandler({}, ({ userId }) => getWeeklyRecap(userId)),
      POST: apiHandler({ rateLimit: "ai" }, ({ userId }) => makeWeeklyRecap(userId)),
    },
  },
});
