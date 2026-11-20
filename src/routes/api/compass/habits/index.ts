import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { createHabit, habitInput } from "@/server/services/compass";

export const Route = createFileRoute("/api/compass/habits/")({
  server: {
    handlers: {
      POST: apiHandler({ body: habitInput }, ({ userId, body }) => createHabit(userId, body)),
    },
  },
});
