import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/img")({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("u");
        if (!raw) {
          return new Response("missing url", { status: 400 });
        }
        const { fetchImageBytes } = await import("@/lib/fetch-image.server.ts");
        const result = await fetchImageBytes(raw);
        if (!result.ok) {
          return new Response(result.error, { status: result.status });
        }
        return new Response(Buffer.from(result.bytes), {
          headers: {
            "content-type": result.mime,
            "cache-control": "public, max-age=86400, immutable",
          },
        });
      },
    },
  },
});
