import { createFileRoute } from "@tanstack/react-router";
import { chatTurnInput } from "@/server/ai";
import { apiHandler } from "@/server/http";
import { askLibrary } from "@/server/services/ai-library";

export const Route = createFileRoute("/api/ai/ask")({
  server: {
    handlers: {
      // Streams an AI SDK UI message stream; the reply's metadata lists its sources.
      POST: apiHandler({ body: chatTurnInput, rateLimit: "ai" }, ({ userId, body }) =>
        askLibrary(userId, body),
      ),
    },
  },
});
