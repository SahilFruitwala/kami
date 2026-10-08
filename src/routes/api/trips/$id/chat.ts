import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { chatInput, clearTripChat, getTripChat, runTripChat } from "@/server/services/trip-agent";
import { tripIdParams } from "@/server/services/trips";

export const Route = createFileRoute("/api/trips/$id/chat")({
  server: {
    handlers: {
      GET: apiHandler({ params: tripIdParams }, ({ userId, params }) =>
        getTripChat(userId, params.id),
      ),
      // Streams an AI SDK UI message stream (text, tool calls, tool results).
      POST: apiHandler(
        { params: tripIdParams, body: chatInput, rateLimit: "agent" },
        ({ userId, params, body }) => runTripChat(userId, params.id, body),
      ),
      DELETE: apiHandler({ params: tripIdParams }, ({ userId, params }) =>
        clearTripChat(userId, params.id),
      ),
    },
  },
});
