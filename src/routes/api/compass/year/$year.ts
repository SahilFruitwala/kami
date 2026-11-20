import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import { getYear, yearParams } from "@/server/services/compass";

export const Route = createFileRoute("/api/compass/year/$year")({
  server: {
    handlers: {
      GET: apiHandler({ params: yearParams }, ({ userId, params }) => getYear(userId, params.year)),
    },
  },
});
