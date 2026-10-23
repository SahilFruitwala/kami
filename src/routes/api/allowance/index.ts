import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { getAllowance } from "@/server/services/allowance";

export const Route = createFileRoute("/api/allowance/")({
  server: {
    handlers: {
      GET: apiHandler({}, ({ userId }) => getAllowance(userId)),
    },
  },
});
