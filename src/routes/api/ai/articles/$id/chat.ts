import { createFileRoute } from "@tanstack/react-router";
import { chatTurnInput } from "@/server/ai";
import { apiHandler } from "@/server/http";
import { chatAboutArticle } from "@/server/services/ai-articles";
import { articleIdParams } from "@/server/services/library";

export const Route = createFileRoute("/api/ai/articles/$id/chat")({
  server: {
    handlers: {
      // Streams an AI SDK UI message stream. Chats aren't stored.
      POST: apiHandler(
        { params: articleIdParams, body: chatTurnInput, rateLimit: "ai" },
        ({ userId, params, body }) => chatAboutArticle(userId, params.id, body),
      ),
    },
  },
});
