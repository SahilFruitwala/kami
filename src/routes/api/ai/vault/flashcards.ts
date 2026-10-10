import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { vaultFlashcards, vaultSlipsInput } from "@/server/services/ai-vault";

export const Route = createFileRoute("/api/ai/vault/flashcards")({
  server: {
    handlers: {
      POST: apiHandler({ body: vaultSlipsInput, rateLimit: "ai" }, ({ userId, body }) =>
        vaultFlashcards(userId, body),
      ),
    },
  },
});
