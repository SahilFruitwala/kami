import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { indexLibrary } from "@/server/services/ai-library";

export const Route = createFileRoute("/api/ai/embed")({
  server: {
    handlers: {
      // One embedding batch per call; the client repeats while `remaining > 0`.
      POST: apiHandler({ rateLimit: "ai" }, ({ userId }) => indexLibrary(userId)),
    },
  },
});
