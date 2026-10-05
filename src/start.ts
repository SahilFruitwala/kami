import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

/**
 * Origin/Fetch-Metadata CSRF check for the JSON API (`/api/*`). Defense in
 * depth on top of `assertSameSiteRequest` + the JSON content-type check in
 * `src/server/http.ts`. Page navigations are not filtered.
 */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) =>
    ctx.handlerType === "serverFn" || new URL(ctx.request.url).pathname.startsWith("/api/"),
});

export const startInstance = createStart(() => {
  return {
    defaultSsr: false,
    requestMiddleware: [csrfMiddleware, clerkMiddleware()],
  };
});
