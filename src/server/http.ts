import "@tanstack/react-start/server-only";
import { z } from "zod";
import { CrossSiteRequestError, assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { UnauthorizedError, requireUserId } from "@/lib/auth/verify.server";
import { RateLimitError, enforceRateLimit, type RateLimitBucket } from "@/lib/rate-limit.server.ts";

/**
 * HTTP layer for `/api/*` routes — **server-only**.
 *
 * Every JSON endpoint goes through `apiHandler`, which owns the cross-cutting
 * concerns so route files stay one-liners over a service call:
 *
 *   1. Fetch-Metadata sibling isolation (`assertSameSiteRequest`)
 *   2. JSON content-type on bodies (blocks HTML-form CSRF, which can't set it)
 *   3. Verified Clerk user (`requireUserId`) — never a client-supplied id
 *   4. Optional per-user rate limit bucket
 *   5. Zod parsing of path params, query string and JSON body
 *   6. Result → JSON (`undefined` → 204) and error → status mapping
 *
 *   export const Route = createFileRoute("/api/journal/")({
 *     server: {
 *       handlers: {
 *         GET: apiHandler({}, ({ userId }) => listJournalEntries(userId)),
 *       },
 *     },
 *   });
 */

/** Throw from a service to return a specific status with a user-facing message. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const notFound = (message = "Not found") => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);

type Schema = z.ZodType;
type Parsed<S> = S extends Schema ? z.output<S> : undefined;

export type ApiContext<P, Q, B> = {
  request: Request;
  userId: string;
  params: Parsed<P>;
  query: Parsed<Q>;
  body: Parsed<B>;
};

type ApiSpec<P, Q, B> = {
  params?: P;
  query?: Q;
  body?: B;
  rateLimit?: RateLimitBucket;
};

type RouteHandlerArgs = { request: Request; params?: Record<string, string> };

const NO_STORE = { "cache-control": "private, no-store" };

export function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(NO_STORE)) if (!headers.has(k)) headers.set(k, v);
  return Response.json(data, { ...init, headers });
}

function errorResponse(status: number, message: string, headers?: HeadersInit): Response {
  return json({ error: message }, { status, headers });
}

/** Map a thrown error to its JSON response. Shared by `apiHandler` and `hookHandler`. */
export function toErrorResponse(err: unknown): Response {
  if (err instanceof z.ZodError) {
    return errorResponse(400, err.issues[0]?.message ?? "Invalid request.");
  }
  if (err instanceof HttpError) return errorResponse(err.status, err.message);
  if (err instanceof UnauthorizedError) return errorResponse(401, err.message);
  if (err instanceof CrossSiteRequestError) return errorResponse(403, "Forbidden");
  if (err instanceof RateLimitError) {
    return errorResponse(429, err.message, { "retry-after": String(err.retryAfterSeconds) });
  }
  // Unexpected failures never leak internals (SQL, stack, hostnames).
  console.error("[api]", err);
  return errorResponse(500, "Something went wrong. Please try again.");
}

async function readJsonBody(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Expected an application/json body.");
  }
  try {
    return await request.json();
  } catch {
    throw badRequest("Malformed JSON body.");
  }
}

/** Build a server-route handler for an authenticated JSON endpoint. */
export function apiHandler<
  P extends Schema | undefined = undefined,
  Q extends Schema | undefined = undefined,
  B extends Schema | undefined = undefined,
>(
  spec: ApiSpec<P, Q, B>,
  handler: (ctx: ApiContext<P, Q, B>) => unknown,
): (args: RouteHandlerArgs) => Promise<Response> {
  return async ({ request, params }) => {
    try {
      assertSameSiteRequest();
      // Read the body before auth so a bad content-type fails fast and cheap.
      const rawBody = spec.body ? await readJsonBody(request) : undefined;
      const userId = await requireUserId();
      if (spec.rateLimit) await enforceRateLimit(userId, spec.rateLimit);

      const ctx = {
        request,
        userId,
        params: spec.params ? spec.params.parse(params ?? {}) : undefined,
        query: spec.query
          ? spec.query.parse(Object.fromEntries(new URL(request.url).searchParams))
          : undefined,
        body: spec.body ? spec.body.parse(rawBody) : undefined,
      } as ApiContext<P, Q, B>;

      const result = await handler(ctx);
      if (result instanceof Response) return result;
      if (result === undefined) return new Response(null, { status: 204, headers: NO_STORE });
      return json(result);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}
