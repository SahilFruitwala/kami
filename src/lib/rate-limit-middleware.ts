import { createMiddleware } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { RateLimitBucket } from "@/lib/rate-limit.server.ts";

/**
 * Auth + per-user rate limit for server functions that fetch from the
 * outside world. Use in place of `authMiddleware`:
 *
 *   createServerFn().middleware([rateLimited("lookup")])
 */
export function rateLimited(bucket: RateLimitBucket) {
  return createMiddleware({ type: "function" })
    .middleware([authMiddleware])
    .server(async ({ next, context }) => {
      const { enforceRateLimit } = await import("@/lib/rate-limit.server.ts");
      await enforceRateLimit(context.userId, bucket);
      return next();
    });
}
