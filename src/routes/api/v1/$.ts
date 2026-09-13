import { createFileRoute } from "@tanstack/react-router";
import { createQuartoApi } from "@/server/quarto-api.ts";

const api = createQuartoApi();

async function handle({ request }: { request: Request }) {
  return api.fetch(request);
}

export const Route = createFileRoute("/api/v1/$")({
  component: () => null,
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      OPTIONS: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
    },
  },
});
