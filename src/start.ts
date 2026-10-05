import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

/**
 * Origin/Fetch-Metadata CSRF check for the JSON API (`/api/*`). Defense in
 * depth on top of `assertSameSiteRequest` + the JSON content-type check in
 * `src/server/http.ts`. Page navigations are not filtered.
 */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => {
    if (ctx.handlerType === "serverFn") return true;
    const path = new URL(ctx.request.url).pathname;
    // `/api/hooks/*` are server-to-server (cron, inbound email): no browser
    // headers to check; they authenticate with a shared secret instead.
    return path.startsWith("/api/") && !path.startsWith("/api/hooks/");
  },
});

export const startInstance = createStart(() => {
  return {
    defaultSsr: false,
    requestMiddleware: [csrfMiddleware, clerkMiddleware()],
  };
});
