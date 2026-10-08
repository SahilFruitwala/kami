import { createFileRoute } from "@tanstack/react-router";

/**
 * Serves images we mirrored into object storage when an article was saved.
 * The storage key is built from the *verified* session user id, so one user
 * can never read another's objects, whatever name they ask for.
 */
export const Route = createFileRoute("/api/media/$name")({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
          assertSameSiteRequest();
        } catch {
          return new Response("forbidden", { status: 403 });
        }
        let userId: string;
        try {
          const { requireUserId } = await import("@/lib/auth/verify.server");
          userId = await requireUserId();
        } catch {
          return new Response("unauthorized", { status: 401 });
        }
        const { MEDIA_NAME_RE, mediaKey } = await import("@/lib/mirror-images.server.ts");
        if (!MEDIA_NAME_RE.test(params.name)) {
          return new Response("not found", { status: 404 });
        }
        const { getObjectStorage } = await import("@/lib/object-storage.server.ts");
        const storage = getObjectStorage();
        if (!storage) return new Response("not found", { status: 404 });
        try {
          const object = await storage.get(mediaKey(userId, params.name));
          if (!object) return new Response("not found", { status: 404 });
          return new Response(object.body, {
            headers: {
              "content-type": object.contentType,
              // Content-addressed name => immutable. Private: never a shared CDN entry.
              "cache-control": "private, max-age=31536000, immutable",
              "content-disposition": "inline",
              "x-content-type-options": "nosniff",
            },
          });
        } catch {
          return new Response("storage unavailable", { status: 502 });
        }
      },
    },
  },
});
