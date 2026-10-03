import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/img")({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Image proxy is an authenticated SSRF/egress surface: only serve it
        // to signed-in users (or to anyone when auth is disabled for local dev).
        let userId = "local-dev";
        if (process.env.VITE_AUTH_ENABLED !== "false") {
          try {
            const { auth } = await import("@clerk/tanstack-react-start/server");
            const session = await auth();
            if (!session.userId) {
              return new Response("unauthorized", { status: 401 });
            }
            userId = session.userId;
          } catch {
            return new Response("unauthorized", { status: 401 });
          }
        }
        // Match server-fn sibling isolation: block scripted cross-site GETs
        // that would otherwise ride a session cookie.
        try {
          const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
          assertSameSiteRequest();
        } catch (err) {
          const status =
            err && typeof err === "object" && "status" in err && typeof err.status === "number"
              ? err.status
              : 403;
          return new Response("forbidden", { status });
        }
        try {
          const { enforceRateLimit } = await import("@/lib/rate-limit.server.ts");
          await enforceRateLimit(userId, "image");
        } catch (err) {
          const retry =
            err && typeof err === "object" && "retryAfterSeconds" in err
              ? String(err.retryAfterSeconds)
              : "60";
          return new Response("too many requests", {
            status: 429,
            headers: { "retry-after": retry },
          });
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
            // Private browser cache only — never `public`/`s-maxage`. A public
            // CDN entry would let anyone with the URL skip auth after the first
            // authenticated fetch warmed the edge.
            "cache-control": "private, max-age=2592000, immutable",
            // Defense in depth if a future mime slip serves active content.
            "content-disposition": "inline",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
