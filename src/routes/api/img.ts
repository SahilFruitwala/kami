import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/img")({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Image proxy is an authenticated SSRF/egress surface: only serve it
        // to signed-in users (or to anyone when auth is disabled for local dev).
        if (process.env.VITE_AUTH_ENABLED !== "false") {
          try {
            const { auth } = await import("@clerk/tanstack-react-start/server");
            const session = await auth();
            if (!session.userId) {
              return new Response("unauthorized", { status: 401 });
            }
          } catch {
            return new Response("unauthorized", { status: 401 });
          }
        }
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
