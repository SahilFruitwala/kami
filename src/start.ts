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
    // Bearer-token clients (the mobile app) aren't CSRF-able: a cross-site
    // browser request can't set `Authorization` without a CORS preflight, and
    // the token itself is verified by Clerk. Cookie-auth requests stay checked.
    if (/^Bearer\s+\S/i.test(ctx.request.headers.get("authorization") ?? "")) return false;
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
