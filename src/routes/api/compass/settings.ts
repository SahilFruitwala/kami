import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { settingsInput, updateSettings } from "@/server/services/compass";

export const Route = createFileRoute("/api/compass/settings")({
  server: {
    handlers: {
      PATCH: apiHandler({ body: settingsInput }, ({ userId, body }) =>
        updateSettings(userId, body),
      ),
    },
  },
});
