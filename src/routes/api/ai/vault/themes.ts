import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { vaultThemes, vaultSlipsInput } from "@/server/services/ai-vault";

export const Route = createFileRoute("/api/ai/vault/themes")({
  server: {
    handlers: {
      POST: apiHandler({ body: vaultSlipsInput, rateLimit: "ai" }, ({ userId, body }) =>
        vaultThemes(userId, body),
      ),
    },
  },
});
